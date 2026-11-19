/* =========================================================
   PANEL DE SABRI
   Sube fotos, arma carpetas y álbumes, ordena y edita los textos del sitio.
   Todo se guarda en el repositorio de GitHub del sitio (datos/sitio.json y la
   carpeta fotos/) y GitHub Pages publica los cambios solo, en uno o dos minutos.
   ========================================================= */
(() => {
  "use strict";

  /* ---------- Configuración ---------- */
  const CFG = window.PANEL || {};
  const API = String(CFG.api || "https://api.github.com").replace(/\/$/, "");
  const REPO = `/repos/${CFG.owner}/${CFG.repo}`;
  const RAMA = CFG.rama || "main";
  const SITIO = CFG.sitio || "../";
  const RUTA_DATOS = "datos/sitio.json";
  const LLAVE = `panel-sabri:${CFG.owner}/${CFG.repo}`;
  const FOTO = { lado: 2000, calidad: 0.82 };       // foto grande (visor)
  const MINI = { ancho: 640, alto: 960, calidad: 0.78 }; // miniatura (pared)
  const PERFIL = { lado: 900, calidad: 0.85 };     // foto de la credencial
  const ESPERA = 2200;                              // ms sin cambios antes de guardar
  const RESERVADOS = ["todas", "mini"];

  /* ---------- Ayudas ---------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const esc = (t) =>
    String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dos = (n) => String(n).padStart(2, "0");
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const idFoto = (f) => (f.archivo || "").replace(/^fotos\//, "").replace(/\.[a-z]+$/i, "").replace(/\//g, "-");
  const slug = (t) =>
    String(t || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      .slice(0, 40) || "carpeta";
  const unico = (base, usados) => {
    let id = base;
    for (let n = 2; usados.includes(id); n++) id = `${base}-${n}`;
    return id;
  };
  const escritorio = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const ICONO = {
    carpeta: '<svg class="item__icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    album: '<svg class="item__icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 15l4-4 4 4 3-3 5 5"/></svg>',
    datos: '<svg class="item__icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 6h14M5 12h14M5 18h9"/></svg>',
    subir: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>'
  };

  /* ---------- Estado ---------- */
  const st = {
    clave: "",
    datos: null,
    base: null,              // { commit, arbol } del último guardado
    arbol: new Map(),        // ruta → sha de cada archivo del repositorio
    vista: { tipo: "carpeta", id: "" },
    elegidas: new Set(),
    editando: null,
    pend: { mover: [], borrar: [] },
    resumen: new Set(),
    sucio: false,
    timer: 0,
    trabajando: 0,
    progreso: "",
    error: null,
    conflicto: false,
    guardadoEn: 0,
    subiendo: [],
    uid: 0,
    recienArrastrado: false
  };
  const D = () => st.datos;

  /* ---------- GitHub ---------- */
  async function pedir(metodo, ruta, cuerpo) {
    let r;
    try {
      r = await fetch(API + ruta, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${st.clave}`,
          Accept: "application/vnd.github+json",
          ...(cuerpo ? { "Content-Type": "application/json" } : {})
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        cache: "no-store"
      });
    } catch (e) {
      const err = new Error("Sin conexión");
      err.status = 0;
      throw err;
    }
    let datos = null;
    try { datos = await r.json(); } catch (e) { /* sin cuerpo */ }
    if (!r.ok) {
      const err = new Error((datos && datos.message) || `HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return datos;
  }

  const desde64 = (b64) =>
    new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const blobA64 = (blob) =>
    new Promise((ok, mal) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => mal(r.error);
      r.readAsDataURL(blob);
    });

  async function enParalelo(lista, n, fn) {
    let i = 0;
    const obreros = Array.from({ length: Math.min(n, lista.length) }, async () => {
      while (i < lista.length) {
        const k = i++;
        await fn(lista[k], k);
      }
    });
    await Promise.all(obreros);
  }

  async function cargarRepo() {
    const ref = await pedir("GET", `${REPO}/git/ref/heads/${RAMA}`);
    const commit = await pedir("GET", `${REPO}/git/commits/${ref.object.sha}`);
    const arbol = await pedir("GET", `${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
    st.base = { commit: commit.sha, arbol: commit.tree.sha };
    st.arbol = new Map(arbol.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]));
    const sha = st.arbol.get(RUTA_DATOS);
    if (!sha) throw new Error(`No está ${RUTA_DATOS} en el repositorio.`);
    const blob = await pedir("GET", `${REPO}/git/blobs/${sha}`);
    st.datos = JSON.parse(desde64(blob.content));
    completarDatos(st.datos);
  }

  // Un guardado = un commit con las fotos nuevas, las movidas, las borradas y datos/sitio.json
  async function confirmar({ subir = [], mover = [], borrar = [], resumen = [], json }) {
    const cambios = new Map(); // ruta → sha (null = borrar)
    const actual = (ruta) => (cambios.has(ruta) ? cambios.get(ruta) : st.arbol.get(ruta));
    let hechos = 0;
    if (subir.length) {
      st.progreso = "Subiendo fotos… 0%";
      pintarEstado();
    }
    await enParalelo(subir, 3, async (s) => {
      const r = await pedir("POST", `${REPO}/git/blobs`, { content: await blobA64(s.blob), encoding: "base64" });
      cambios.set(s.ruta, r.sha);
      hechos++;
      st.progreso = `Subiendo fotos… ${Math.round((hechos / subir.length) * 100)}%`;
      pintarEstado();
    });
    st.progreso = "Guardando…";
    pintarEstado();
    for (const m of mover) {
      const sha = actual(m.de);
      if (!sha || m.de === m.a) continue;
      cambios.set(m.a, sha);
      cambios.set(m.de, null);
    }
    for (const ruta of borrar) if (actual(ruta)) cambios.set(ruta, null);
    const rj = await pedir("POST", `${REPO}/git/blobs`, { content: json, encoding: "utf-8" });
    cambios.set(RUTA_DATOS, rj.sha);

    // GitHub no acepta borrar algo que no existe
    const tree = [...cambios]
      .filter(([ruta, sha]) => sha || st.arbol.has(ruta))
      .map(([path, sha]) => ({ path, mode: "100644", type: "blob", sha }));
    const arbol = await pedir("POST", `${REPO}/git/trees`, { base_tree: st.base.arbol, tree });
    const commit = await pedir("POST", `${REPO}/git/commits`, {
      message: mensajeCommit(resumen),
      tree: arbol.sha,
      parents: [st.base.commit]
    });
    await pedir("PATCH", `${REPO}/git/refs/heads/${RAMA}`, { sha: commit.sha, force: false });
    st.base = { commit: commit.sha, arbol: arbol.sha };
    cambios.forEach((sha, ruta) => (sha ? st.arbol.set(ruta, sha) : st.arbol.delete(ruta)));
  }

  function mensajeCommit(resumen) {
    const r = [...new Set(resumen)].filter(Boolean);
    if (!r.length) return "Panel: guarda cambios";
    const resto = r.length - 3;
    return `Panel: ${r.slice(0, 3).join("; ")}${resto > 0 ? ` y ${plural(resto, "cambio", "cambios")} más` : ""}`;
  }

  /* ---------- Guardado automático ---------- */
  let cola = Promise.resolve();
  function encolar(tarea) {
    st.trabajando++;
    pintarEstado();
    const p = cola
      .then(async () => {
        if (st.conflicto) return;
        await tarea();
        st.error = null;
        st.guardadoEn = Date.now();
      })
      .catch(fallo)
      .finally(() => {
        st.trabajando--;
        st.progreso = "";
        pintarEstado();
      });
    cola = p;
    return p;
  }

  function cambio(resumen, { rapido = false } = {}) {
    st.sucio = true;
    if (resumen) st.resumen.add(resumen);
    clearTimeout(st.timer);
    st.timer = setTimeout(() => encolar(guardarPendiente), rapido ? 400 : ESPERA);
    pintarEstado();
  }

  function serializar(d) {
    return JSON.stringify(d, (k, v) => (k && k[0] === "_" ? undefined : v), 2) + "\n";
  }

  function tomarPendientes() {
    clearTimeout(st.timer);
    const ops = { mover: st.pend.mover, borrar: st.pend.borrar, resumen: [...st.resumen], json: serializar(st.datos) };
    st.pend = { mover: [], borrar: [] };
    st.resumen.clear();
    st.sucio = false;
    return ops;
  }

  function devolverPendientes(ops) {
    st.pend.mover = ops.mover.concat(st.pend.mover);
    st.pend.borrar = ops.borrar.concat(st.pend.borrar);
    ops.resumen.forEach((r) => st.resumen.add(r));
    st.sucio = true;
  }

  async function guardarPendiente() {
    if (!st.sucio) return;
    const ops = tomarPendientes();
    try {
      await confirmar(ops);
    } catch (e) {
      devolverPendientes(ops);
      throw e;
    }
  }

  function fallo(e) {
    console.error(e);
    const msg = String((e && e.message) || "");
    if ((e && (e.status === 409 || e.status === 422)) && /fast.?forward|conflict|reference/i.test(msg)) {
      st.conflicto = true;
      abrirModal({
        titulo: "Hay cambios nuevos",
        texto: "Se guardaron cambios desde otro lado (otra pestaña u otro dispositivo). Recargá el panel para seguir con la versión más nueva.",
        aceptar: "Recargar",
        cancelar: ""
      }).then(() => location.reload());
      return;
    }
    st.error = e;
    if (e && e.status === 401) aviso("La clave venció o no es válida. Tocá Salir y entrá con una clave nueva.");
    else if (e && e.status === 403) aviso("La clave no tiene permiso para guardar. Tiene que tener Contents: Read and write.");
    else if (e && e.status === 0) aviso("No hay conexión. Cuando vuelva, tocá Reintentar.");
    else aviso("No se pudo guardar. Tocá Reintentar.");
  }

  /* ---------- Datos ---------- */
  function completarDatos(d) {
    d.carpetas = Array.isArray(d.carpetas) ? d.carpetas : [];
    d.albumes = Array.isArray(d.albumes) ? d.albumes : [];
    d.fotos = Array.isArray(d.fotos) ? d.fotos.filter((f) => f && f.archivo) : [];
    d.contacto = d.contacto && typeof d.contacto === "object" ? d.contacto : {};
    d.bio = Array.isArray(d.bio) ? d.bio : [];
    d.fotos.forEach((f) => {
      ["album", "titulo", "lugar", "anio"].forEach((k) => { if (f[k] == null) f[k] = ""; });
      if (!f.mini) f.mini = f.archivo.replace(/\/([^/]+)$/, "/mini/$1");
    });
    d.carpetas.forEach((c) => {
      const usados = d.fotos
        .filter((f) => f.carpeta === c.id)
        .map((f) => parseInt((f.archivo.match(/\/(\d+)\.[a-z]+$/i) || [])[1], 10))
        .filter((n) => !isNaN(n));
      c.proximo = Math.max(Number(c.proximo) || 1, (usados.length ? Math.max(...usados) : 0) + 1);
      if (!c.sector) c.sector = c.nombre;
    });
  }

  const carpetaPorId = (id) => D().carpetas.find((c) => c.id === id);
  const albumPorId = (id) => D().albumes.find((a) => a.id === id);
  const fotosDe = (cid) => D().fotos.filter((f) => f.carpeta === cid);
  const fotosDeAlbum = (aid) => D().fotos.filter((f) => f.album === aid);
  const albumesDe = (cid) => D().albumes.filter((a) => a.carpeta === cid);
  const tituloAuto = (f) => {
    const a = f.album && albumPorId(f.album);
    return (a && a.titulo) || (carpetaPorId(f.carpeta) || {}).nombre || "Sin título";
  };
  function carpetaActual() {
    const v = st.vista;
    if (v.tipo === "carpeta") return carpetaPorId(v.id);
    if (v.tipo === "album") {
      const a = albumPorId(v.id);
      return a && carpetaPorId(a.carpeta);
    }
    return null;
  }
  function fotosVista() {
    const v = st.vista;
    if (v.tipo === "carpeta") return fotosDe(v.id);
    if (v.tipo === "album") return fotosDeAlbum(v.id);
    return [];
  }

  function insertarAlPrincipio(cid, nuevas) {
    const i = D().fotos.findIndex((f) => f.carpeta === cid);
    if (i < 0) D().fotos.push(...nuevas);
    else D().fotos.splice(i, 0, ...nuevas);
  }

  function reordenar(viejo, nuevo) {
    const enVista = new Set(viejo);
    let k = 0;
    D().fotos = D().fotos.map((f) => (enVista.has(f) ? nuevo[k++] : f));
    cambio("cambia el orden de las fotos");
  }

  function moverEnVista(f, destino) {
    const lista = fotosVista();
    const k = lista.indexOf(f);
    if (k < 0) return;
    const nueva = lista.slice();
    nueva.splice(k, 1);
    nueva.splice(Math.max(0, Math.min(destino, nueva.length)), 0, f);
    reordenar(lista, nueva);
    pintarGrillaActual();
    pintarEditor();
  }

  // los archivos se mueven o se borran en el próximo guardado
  function registrarMovida(de, a) {
    const previa = st.pend.mover.find((m) => m.a === de);
    if (previa) previa.a = a;
    else st.pend.mover.push({ de, a });
    st.pend.mover = st.pend.mover.filter((m) => m.de !== m.a);
  }
  function registrarBorrado(ruta) {
    const previa = st.pend.mover.find((m) => m.a === ruta);
    if (previa) {
      st.pend.mover = st.pend.mover.filter((m) => m !== previa);
      st.pend.borrar.push(previa.de);
    } else st.pend.borrar.push(ruta);
  }

  const numeroArchivo = (n) => String(n).padStart(2, "0");

  function moverACarpeta(fotos, destinoId) {
    const destino = carpetaPorId(destinoId);
    const lista = fotos.filter((f) => f.carpeta !== destinoId);
    if (!destino || !lista.length) return 0;
    lista.forEach((f) => {
      const idViejo = idFoto(f);
      const viejaG = f.archivo;
      const viejaM = f.mini;
      const nn = numeroArchivo(destino.proximo++);
      if (!f._local && !f._ver) f._ver = SITIO + viejaM; // se sigue viendo hasta que se publique
      f.archivo = `fotos/${destino.id}/${nn}.jpg`;
      f.mini = `fotos/${destino.id}/mini/${nn}.jpg`;
      D().albumes.forEach((a) => { if (a.portada === idViejo) a.portada = ""; });
      f.album = "";
      f.carpeta = destino.id;
      registrarMovida(viejaG, f.archivo);
      registrarMovida(viejaM, f.mini);
    });
    const set = new Set(lista);
    D().fotos = D().fotos.filter((f) => !set.has(f));
    insertarAlPrincipio(destino.id, lista);
    cambio(`mueve ${plural(lista.length, "foto", "fotos")} a ${destino.nombre}`, { rapido: true });
    return lista.length;
  }

  function borrarFotos(fotos) {
    const set = new Set(fotos);
    fotos.forEach((f) => {
      const id = idFoto(f);
      D().albumes.forEach((a) => { if (a.portada === id) a.portada = ""; });
      registrarBorrado(f.archivo);
      registrarBorrado(f.mini);
      st.elegidas.delete(f);
    });
    D().fotos = D().fotos.filter((f) => !set.has(f));
    if (st.editando && set.has(st.editando)) cerrarEditor();
    cambio(`borra ${plural(fotos.length, "foto", "fotos")}`, { rapido: true });
  }

  function ponerEnAlbum(fotos, albumId) {
    const a = albumId ? albumPorId(albumId) : null;
    let n = 0;
    fotos.forEach((f) => {
      if (a && f.carpeta !== a.carpeta) return;
      if (f.album === albumId) return;
      const viejo = f.album && albumPorId(f.album);
      if (viejo && viejo.portada === idFoto(f)) viejo.portada = "";
      f.album = albumId || "";
      n++;
    });
    if (n) cambio(a ? `agrega fotos al álbum ${a.titulo}` : "saca fotos de un álbum");
    return n;
  }

  /* ---------- Imágenes: se achican en el navegador antes de subir ---------- */
  async function decodificar(file) {
    if ("createImageBitmap" in window) {
      try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* probamos con <img> */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }
  const medida = (f) => ({ w: f.naturalWidth || f.width, h: f.naturalHeight || f.height });
  function lienzo(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  async function achicar(fuente, maxAncho, maxAlto, calidad) {
    const { w: w0, h: h0 } = medida(fuente);
    if (!w0 || !h0) throw new Error("Imagen vacía");
    const escala = Math.min(1, maxAncho / w0, maxAlto / h0);
    const w = Math.max(1, Math.round(w0 * escala));
    const h = Math.max(1, Math.round(h0 * escala));
    // achicar de a la mitad deja la foto más nítida
    let actual = fuente;
    let aw = w0;
    let ah = h0;
    while (aw / 2 >= w && ah / 2 >= h) {
      const c = lienzo(Math.round(aw / 2), Math.round(ah / 2));
      const x = c.getContext("2d");
      x.imageSmoothingQuality = "high";
      x.drawImage(actual, 0, 0, c.width, c.height);
      actual = c;
      aw = c.width;
      ah = c.height;
    }
    const final = lienzo(w, h);
    const ctx = final.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(actual, 0, 0, w, h);
    const blob = await new Promise((ok, mal) => final.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo comprimir"))), "image/jpeg", calidad));
    return { blob, ancho: w, alto: h };
  }
  const cerrarFuente = (f) => { if (f && typeof f.close === "function") f.close(); };
  const esImagen = (file) => /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);

  // muestra una imagen probando: la versión local → el sitio → GitHub directo
  function ponerImagen(img, f, { grande = false } = {}) {
    const fuentes = [];
    const ruta = grande ? f.archivo : f.mini;
    if (!grande && f._local) fuentes.push(f._local);
    if (!grande && f._ver) fuentes.push(f._ver);
    fuentes.push(SITIO + ruta);
    if (!CFG.local && st.base) fuentes.push(`https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/${st.base.commit}/${ruta}`);
    if (grande && f._local) fuentes.push(f._local);
    if (grande && f._ver) fuentes.push(f._ver);
    if (!grande) fuentes.push(SITIO + f.archivo);
    if (img.dataset.fuente === fuentes[0]) return;
    let k = 0;
    img.onerror = () => {
      k++;
      if (k < fuentes.length) img.src = fuentes[k];
      else img.onerror = null;
    };
    img.dataset.fuente = fuentes[0];
    img.src = fuentes[0];
  }

  /* ---------- Subir fotos ---------- */
  async function subirFotos(archivos) {
    const c = carpetaActual();
    if (!c) return;
    const album = st.vista.tipo === "album" ? st.vista.id : "";
    const lista = [...archivos].filter(esImagen);
    if (!lista.length) {
      aviso("Elegí fotos en JPG, PNG o WEBP.");
      return;
    }
    const items = lista.map((file) => ({ uid: ++st.uid, file, nombre: file.name, carpeta: c.id, album, estado: "Preparando…", url: "" }));
    st.subiendo.push(...items);
    pintarGrillaActual();

    await enParalelo(items, 2, async (it) => {
      try {
        const fuente = await decodificar(it.file);
        it.grande = await achicar(fuente, FOTO.lado, FOTO.lado, FOTO.calidad);
        it.mini = await achicar(fuente, MINI.ancho, MINI.alto, MINI.calidad);
        cerrarFuente(fuente);
        it.url = URL.createObjectURL(it.mini.blob);
        it.estado = "En espera…";
      } catch (e) {
        console.error(it.nombre, e);
        it.error = true;
        it.estado = "No se pudo leer";
      }
      pintarGrillaActual();
    });

    const malas = items.filter((it) => it.error);
    const buenas = items.filter((it) => !it.error);
    if (malas.length) {
      aviso(`${plural(malas.length, "foto no se pudo leer", "fotos no se pudieron leer")}. Probá exportarlas como JPG.`);
      setTimeout(() => {
        st.subiendo = st.subiendo.filter((it) => !malas.includes(it));
        pintarGrillaActual();
      }, 7000);
    }
    if (!buenas.length) return;
    buenas.forEach((it) => { it.estado = "Subiendo…"; });
    pintarGrillaActual();

    encolar(async () => {
      const carpeta = carpetaPorId(c.id);
      st.subiendo = st.subiendo.filter((it) => !buenas.includes(it));
      if (!carpeta) {
        pintar();
        throw new Error("La carpeta ya no existe");
      }
      const albumOk = album && albumPorId(album) ? album : "";
      const nuevas = buenas.map((it) => {
        const nn = numeroArchivo(carpeta.proximo++);
        return {
          archivo: `fotos/${carpeta.id}/${nn}.jpg`,
          mini: `fotos/${carpeta.id}/mini/${nn}.jpg`,
          carpeta: carpeta.id,
          album: albumOk,
          titulo: "",
          lugar: "",
          anio: "",
          ancho: it.grande.ancho,
          alto: it.grande.alto,
          _local: it.url
        };
      });
      insertarAlPrincipio(carpeta.id, nuevas);
      pintar();
      const ops = tomarPendientes();
      ops.resumen.unshift(`sube ${plural(nuevas.length, "foto", "fotos")} a ${carpeta.nombre}`);
      const subir = nuevas.flatMap((f, k) => [
        { ruta: f.archivo, blob: buenas[k].grande.blob },
        { ruta: f.mini, blob: buenas[k].mini.blob }
      ]);
      try {
        await confirmar({ ...ops, subir });
        aviso(`${plural(nuevas.length, "foto subida", "fotos subidas")} a ${carpeta.nombre}. En el sitio aparecen en 1 o 2 minutos.`);
      } catch (e) {
        const set = new Set(nuevas);
        D().fotos = D().fotos.filter((f) => !set.has(f));
        devolverPendientes(ops);
        pintar();
        throw e;
      }
    });
  }

  async function subirPerfil(file) {
    if (!file || !esImagen(file)) return;
    let img;
    try {
      const fuente = await decodificar(file);
      img = await achicar(fuente, PERFIL.lado, PERFIL.lado, PERFIL.calidad);
      cerrarFuente(fuente);
    } catch (e) {
      aviso("No se pudo leer esa imagen. Probá con un JPG.");
      return;
    }
    const ruta = `fotos/perfil-${Date.now().toString(36)}.jpg`;
    D()._perfilLocal = URL.createObjectURL(img.blob);
    if (st.vista.tipo === "datos") pintarPrincipal();
    encolar(async () => {
      const anterior = D().fotoPerfil;
      D().fotoPerfil = ruta;
      if (anterior && /^fotos\/perfil-/.test(anterior)) registrarBorrado(anterior);
      const ops = tomarPendientes();
      ops.resumen.unshift("cambia la foto de la credencial");
      try {
        await confirmar({ ...ops, subir: [{ ruta, blob: img.blob }] });
        aviso("Listo: foto de la credencial actualizada.");
      } catch (e) {
        D().fotoPerfil = anterior;
        devolverPendientes(ops);
        throw e;
      }
    });
  }

  /* ---------- Pintar ---------- */
  function pintar() {
    pintarLateral();
    pintarPrincipal();
    pintarSeleccion();
    pintarEstado();
  }

  function pintarEstado() {
    const el = $("#estado");
    if (!el) return;
    let clase = "";
    let html = "";
    if (st.conflicto) {
      clase = "error";
      html = 'Hay cambios nuevos · <button type="button" data-accion="recargar">Recargar</button>';
    } else if (st.trabajando) {
      clase = "trabajando";
      html = `<span class="giro" aria-hidden="true"></span>${esc(st.progreso || "Guardando…")}`;
    } else if (st.error) {
      clase = "error";
      html = 'No se guardó · <button type="button" data-accion="reintentar">Reintentar</button>';
    } else if (st.sucio) {
      clase = "pendiente";
      html = "Cambios sin guardar…";
    } else if (st.guardadoEn && Date.now() - st.guardadoEn < 120000) {
      html = "Guardado · en el sitio en 1 o 2 min";
    } else {
      html = "Todo guardado";
    }
    el.innerHTML = `<span class="estado${clase ? " estado--" + clase : ""}">${html}</span>`;
  }

  function pintarLateral() {
    const v = st.vista;
    let html = '<p class="lateral__titulo">Carpetas</p><ul class="lateral__lista">';
    D().carpetas.forEach((c) => {
      const actual = v.tipo === "carpeta" && v.id === c.id;
      html +=
        `<li><button class="item" type="button" data-ir="carpeta:${esc(c.id)}" aria-current="${actual}">` +
        `${ICONO.carpeta}<span class="item__nombre">${esc(c.nombre)}</span><span class="item__cuenta">${fotosDe(c.id).length}</span></button></li>`;
      albumesDe(c.id).forEach((a) => {
        const act = v.tipo === "album" && v.id === a.id;
        html +=
          `<li><button class="item item--album" type="button" data-ir="album:${esc(a.id)}" aria-current="${act}">` +
          `${ICONO.album}<span class="item__nombre">${esc(a.titulo)}</span><span class="item__cuenta">${fotosDeAlbum(a.id).length}</span></button></li>`;
      });
    });
    html +=
      '</ul><button class="boton boton--sutil lateral__nueva" type="button" data-accion="nueva-carpeta">+ Nueva carpeta</button>' +
      '<hr class="lateral__separador"><ul class="lateral__lista">' +
      `<li><button class="item" type="button" data-ir="datos:" aria-current="${v.tipo === "datos"}">${ICONO.datos}<span class="item__nombre">Datos del sitio</span></button></li></ul>`;
    $("#lateral").innerHTML = html;
    const activo = $('#lateral [aria-current="true"]');
    if (activo && !escritorio()) activo.scrollIntoView({ inline: "center", block: "nearest" });
  }

  function zonaSubir(titulo) {
    return (
      `<div class="subir" role="button" tabindex="0" data-accion="elegir-fotos" aria-label="${esc(titulo)}">` +
      `<span class="subir__icono">${ICONO.subir}</span>` +
      `<span class="subir__texto"><strong>${esc(titulo)}</strong><span>${escritorio() ? "Arrastralas acá o hacé clic para elegirlas." : "Tocá para elegirlas."} Se achican solas para que el sitio cargue rápido.</span></span>` +
      `<span class="boton boton--primario">Elegir fotos</span></div>`
    );
  }

  function pintarPrincipal() {
    const main = $("#principal");
    const v = st.vista;
    if (v.tipo === "datos") return vistaDatos(main);
    if (v.tipo === "album" && albumPorId(v.id)) return vistaAlbum(main, albumPorId(v.id));
    const c = carpetaPorId(v.id) || D().carpetas[0];
    if (!c) {
      main.innerHTML =
        '<div class="vacio"><strong>Todavía no hay carpetas</strong><span>Creá la primera para empezar a subir fotos.</span>' +
        '<button class="boton boton--primario" type="button" data-accion="nueva-carpeta">+ Nueva carpeta</button></div>';
      return;
    }
    st.vista = { tipo: "carpeta", id: c.id };
    vistaCarpeta(main, c);
  }

  function vistaCarpeta(main, c) {
    const fotos = fotosDe(c.id);
    const albs = albumesDe(c.id);
    const i = D().carpetas.indexOf(c);
    main.innerHTML =
      `<div class="cabecera"><div>` +
      `<p class="cabecera__ruta">Carpeta</p><h1>${esc(c.nombre)}</h1>` +
      `<p class="cabecera__datos">${plural(fotos.length, "foto", "fotos")} · En el sitio es la entrada “Sector ${esc(c.sector || c.nombre)}”</p>` +
      `</div><div class="cabecera__acciones">` +
      `<button class="boton boton--chico" type="button" data-accion="editar-carpeta">Cambiar nombre</button>` +
      `<button class="boton boton--chico boton--icono" type="button" data-accion="carpeta-arriba" title="Subirla en la lista" aria-label="Subirla en la lista" ${i <= 0 ? "disabled" : ""}>↑</button>` +
      `<button class="boton boton--chico boton--icono" type="button" data-accion="carpeta-abajo" title="Bajarla en la lista" aria-label="Bajarla en la lista" ${i >= D().carpetas.length - 1 ? "disabled" : ""}>↓</button>` +
      `<button class="boton boton--chico boton--peligro" type="button" data-accion="borrar-carpeta">Borrar carpeta</button>` +
      `</div></div>` +
      zonaSubir(`Subir fotos a ${c.nombre}`) +
      `<section class="bloque"><h2 class="bloque__titulo">Álbumes de esta carpeta</h2><div class="albumes">` +
      albs.map(tarjetaAlbum).join("") +
      `<button class="album-tarjeta album-nuevo" type="button" data-accion="nuevo-album">+ Nuevo álbum</button></div></section>` +
      `<div class="grilla-titulo"><h2>Fotos</h2><p>${fotos.length > 1 ? (escritorio() ? "Arrastrá una foto para cambiar el orden. " : "Para cambiar el orden, tocá una foto. ") + "Las primeras se ven primero en el sitio." : ""}</p></div>` +
      `<div class="grilla" id="grilla"></div>`;
    pintarGrilla(fotos);
  }

  function tarjetaAlbum(a) {
    const fotos = fotosDeAlbum(a.id);
    const tapa = fotos.find((f) => idFoto(f) === a.portada) || fotos[0];
    return (
      `<button class="album-tarjeta" type="button" data-ir="album:${esc(a.id)}">` +
      (tapa ? `<img class="album-tarjeta__tapa" alt="" data-tapa="${esc(idFoto(tapa))}">` : '<span class="album-tarjeta__tapa"></span>') +
      `<span><strong>${esc(a.titulo)}</strong><span>${plural(fotos.length, "foto", "fotos")}${a.fecha ? " · " + esc(a.fecha) : ""}</span></span></button>`
    );
  }

  function vistaAlbum(main, a) {
    const c = carpetaPorId(a.carpeta);
    const fotos = fotosDeAlbum(a.id);
    main.innerHTML =
      `<div class="cabecera"><div>` +
      `<p class="cabecera__ruta">Carpeta <button type="button" data-ir="carpeta:${esc(c.id)}">${esc(c.nombre)}</button> › Álbum</p>` +
      `<h1>${esc(a.titulo)}</h1>` +
      `<p class="cabecera__datos">${[plural(fotos.length, "foto", "fotos"), a.fecha, a.texto].filter(Boolean).map(esc).join(" · ")}</p>` +
      `</div><div class="cabecera__acciones">` +
      `<button class="boton boton--chico" type="button" data-accion="agregar-al-album">+ Agregar fotos de ${esc(c.nombre)}</button>` +
      `<button class="boton boton--chico" type="button" data-accion="editar-album">Editar álbum</button>` +
      `<button class="boton boton--chico boton--peligro" type="button" data-accion="borrar-album">Borrar álbum</button>` +
      `</div></div>` +
      zonaSubir("Subir fotos a este álbum") +
      `<div class="grilla-titulo"><h2>Fotos del álbum</h2><p>${fotos.length > 1 ? "La foto marcada como Tapa es la que se ve en el sobre del álbum." : ""}</p></div>` +
      `<div class="grilla" id="grilla"></div>`;
    pintarGrilla(fotos);
  }

  /* --- grilla: las tarjetas se reutilizan para que las fotos no parpadeen --- */
  const tarjetas = new WeakMap();
  function pintarGrillaActual() {
    pintarLateral();
    if ($("#grilla")) pintarGrilla(fotosVista());
    $$("[data-tapa]").forEach((img) => {
      const f = D().fotos.find((x) => idFoto(x) === img.dataset.tapa);
      if (f) ponerImagen(img, f);
    });
  }

  function pintarGrilla(fotos) {
    const g = $("#grilla");
    if (!g) return;
    const v = st.vista;
    const subiendo = st.subiendo.filter((it) => (v.tipo === "carpeta" ? it.carpeta === v.id : it.album === v.id));
    const nodos = [...subiendo.map(tarjetaSubiendo), ...fotos.map((f, k) => tarjetaFoto(f, k))];
    if (!nodos.length) {
      const c = carpetaActual();
      g.innerHTML =
        `<div class="vacio" style="grid-column:1/-1"><strong>${v.tipo === "album" ? "Este álbum todavía no tiene fotos" : "Esta carpeta todavía está vacía"}</strong>` +
        `<span>${v.tipo === "album" ? `Subí fotos nuevas o agregá fotos que ya están en ${esc(c ? c.nombre : "la carpeta")}.` : "Subí las primeras fotos con el botón de arriba."}</span></div>`;
    } else g.replaceChildren(...nodos);
    g.classList.toggle("grilla--eligiendo", st.elegidas.size > 0);
    $$("[data-tapa]").forEach((img) => {
      const f = D().fotos.find((x) => idFoto(x) === img.dataset.tapa);
      if (f) ponerImagen(img, f);
    });
  }

  function tarjetaFoto(f, k) {
    let t = tarjetas.get(f);
    if (!t) {
      t = document.createElement("div");
      t.className = "tarjeta";
      t.tabIndex = 0;
      t.innerHTML =
        '<div class="tarjeta__marco"><img alt="" loading="lazy" decoding="async" draggable="false">' +
        '<span class="tarjeta__nro"></span><span class="tarjeta__tapa" hidden>Tapa</span>' +
        '<button class="tarjeta__marcar" type="button" aria-label="Elegir esta foto">✓</button></div>' +
        '<div class="tarjeta__pie"><span class="tarjeta__titulo"></span><span class="tarjeta__etiqueta" hidden></span></div>';
      t._foto = f;
      tarjetas.set(f, t);
    }
    ponerImagen($("img", t), f);
    $(".tarjeta__nro", t).textContent = dos(k + 1);
    const titulo = f.titulo || tituloAuto(f);
    const tit = $(".tarjeta__titulo", t);
    tit.textContent = f.titulo || "Sin título";
    tit.classList.toggle("tarjeta__titulo--auto", !f.titulo);
    const a = f.album && albumPorId(f.album);
    const et = $(".tarjeta__etiqueta", t);
    et.hidden = !(a && st.vista.tipo === "carpeta");
    et.textContent = a ? a.titulo : "";
    $(".tarjeta__tapa", t).hidden = !(a && st.vista.tipo === "album" && a.portada === idFoto(f));
    t.setAttribute("aria-selected", String(st.elegidas.has(f)));
    t.setAttribute("aria-label", `Foto ${dos(k + 1)}: ${titulo}`);
    t.classList.remove("tarjeta--arrastrada");
    return t;
  }

  function tarjetaSubiendo(it) {
    const t = document.createElement("div");
    t.className = `tarjeta tarjeta--subiendo${it.error ? " tarjeta--error" : ""}`;
    t.innerHTML =
      `<div class="tarjeta__marco">${it.url ? `<img alt="" src="${it.url}">` : ""}` +
      `<span class="tarjeta__progreso">${it.error ? "" : '<span class="giro" aria-hidden="true"></span>'}${esc(it.estado)}</span></div>` +
      `<div class="tarjeta__pie"><span class="tarjeta__titulo">${esc(it.nombre)}</span></div>`;
    return t;
  }

  function pintarSeleccion() {
    const barra = $("#seleccion");
    const n = st.elegidas.size;
    $("#grilla")?.classList.toggle("grilla--eligiendo", n > 0);
    if (!n) {
      barra.hidden = true;
      return;
    }
    const c = carpetaActual();
    const otras = D().carpetas.filter((x) => !c || x.id !== c.id);
    const albs = c ? albumesDe(c.id).filter((a) => !(st.vista.tipo === "album" && a.id === st.vista.id)) : [];
    barra.innerHTML =
      `<span class="seleccion__cuenta">${plural(n, "foto elegida", "fotos elegidas")}</span>` +
      (otras.length
        ? `<select data-cambio="mover-a" aria-label="Mover a otra carpeta"><option value="">Mover a carpeta…</option>${otras.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join("")}</select>`
        : "") +
      (albs.length
        ? `<select data-cambio="poner-album" aria-label="Poner en un álbum"><option value="">Poner en álbum…</option>${albs.map((a) => `<option value="${esc(a.id)}">${esc(a.titulo)}</option>`).join("")}</select>`
        : "") +
      (st.vista.tipo === "album" ? '<button class="boton boton--chico" type="button" data-accion="sacar-album">Sacar del álbum</button>' : "") +
      '<button class="boton boton--chico boton--peligro" type="button" data-accion="borrar-elegidas">Borrar</button>' +
      '<button class="boton boton--chico" type="button" data-accion="elegir-todas">Elegir todas</button>' +
      '<button class="boton boton--chico" type="button" data-accion="cancelar-eleccion">Listo</button>';
    barra.hidden = false;
  }

  function alternarEleccion(f) {
    if (st.elegidas.has(f)) st.elegidas.delete(f);
    else st.elegidas.add(f);
    const t = tarjetas.get(f);
    if (t) t.setAttribute("aria-selected", String(st.elegidas.has(f)));
    pintarSeleccion();
  }

  /* --- datos del sitio --- */
  function vistaDatos(main) {
    const d = D();
    const ct = d.contacto || {};
    const campo = (clave, etiqueta, valor, extra = "", ayuda = "") =>
      `<label class="campo"><span class="campo__etiqueta">${etiqueta}</span><input data-dato="${clave}" value="${esc(valor)}" ${extra}>` +
      (ayuda ? `<span class="campo__ayuda">${ayuda}</span>` : "") +
      "</label>";
    main.innerHTML =
      `<div class="cabecera"><div><p class="cabecera__ruta">Sitio</p><h1>Datos del sitio</h1>` +
      `<p class="cabecera__datos">Los textos de la portada, de “Quién saca las fotos” y del contacto. Se guardan solos.</p></div></div>` +
      `<section class="hoja"><h2>Foto para la credencial</h2><p>Aparece en la credencial de prensa de “Quién saca las fotos”. Queda mejor una foto vertical.</p>` +
      `<div class="perfil"><div class="perfil__foto" id="perfil-foto">${esc((d.nombre || "S").charAt(0))}</div>` +
      `<button class="boton" type="button" data-accion="elegir-perfil">${d.fotoPerfil ? "Cambiar foto" : "Elegir foto"}</button></div></section>` +
      `<section class="hoja"><h2>Nombre y portada</h2><p>Lo que se ve apenas se abre el sitio.</p>` +
      `<div class="fila-campos">${campo("nombre", "Nombre en el trapo", d.nombre, 'maxlength="20"')}${campo("nombreCompleto", "Nombre completo", d.nombreCompleto, 'maxlength="60"')}</div>` +
      campo("ciudad", "Ciudad", d.ciudad, 'maxlength="40"') +
      campo("bajada", "Frase de portada", d.bajada, 'maxlength="140"', "Lo que va entre *asteriscos* queda resaltado con fibrón.") +
      `</section>` +
      `<section class="hoja"><h2>Quién saca las fotos</h2><p>Para separar párrafos, dejá un renglón vacío entre ellos.</p>` +
      `<label class="campo"><span class="campo__etiqueta">Texto</span><textarea data-dato="bio" rows="8">${esc((d.bio || []).join("\n\n"))}</textarea></label></section>` +
      `<section class="hoja"><h2>Contacto</h2><p>El formulario “Armá tu fecha” manda los pedidos por mail o, si no hay mail, por Instagram.</p>` +
      `<div class="fila-campos">${campo("contacto.instagram", "Instagram", ct.instagram, 'placeholder="usuario, sin @" autocapitalize="off" spellcheck="false"')}${campo("contacto.email", "Mail", ct.email, 'type="email" placeholder="nombre@mail.com" autocapitalize="off"')}</div></section>` +
      `<section class="hoja"><h2>Firma de las fotos</h2><p>Aparece en una esquina de cada foto abierta en grande. Dejala vacía para sacarla.</p>` +
      campo("firma", "Firma", d.firma, 'maxlength="40"') +
      `</section>`;
    const caja = $("#perfil-foto");
    const fuente = d._perfilLocal || (d.fotoPerfil ? SITIO + d.fotoPerfil : "");
    if (fuente) {
      const img = new Image();
      img.alt = "Foto de la credencial";
      img.onload = () => caja.replaceChildren(img);
      img.onerror = () => {
        if (!CFG.local && st.base && d.fotoPerfil && !img.dataset.otra) {
          img.dataset.otra = "1";
          img.src = `https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/${st.base.commit}/${d.fotoPerfil}`;
        }
      };
      img.src = fuente;
    }
  }

  function guardarDato(clave, valor) {
    const d = D();
    if (clave === "bio") {
      d.bio = valor.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    } else if (clave.startsWith("contacto.")) {
      const k = clave.split(".")[1];
      let v = valor.trim();
      if (k === "instagram") v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?].*$/, "").replace(/^@/, "");
      d.contacto[k] = v;
    } else d[clave] = valor;
    cambio("edita los datos del sitio");
  }

  /* --- editor de una foto --- */
  function abrirEditor(f) {
    st.editando = f;
    pintarEditor();
    $("#editor").hidden = false;
    $("#editor-fondo").hidden = false;
    setTimeout(() => $('#editor [data-accion="cerrar-editor"]')?.focus(), 30);
  }
  function cerrarEditor() {
    const f = st.editando;
    st.editando = null;
    $("#editor").hidden = true;
    $("#editor-fondo").hidden = true;
    const t = f && tarjetas.get(f);
    if (t && t.isConnected) t.focus({ preventScroll: true });
  }

  function pintarEditor() {
    const ed = $("#editor");
    const f = st.editando;
    if (!f) return;
    const lista = fotosVista();
    const k = lista.indexOf(f);
    const albs = albumesDe(f.carpeta);
    const a = f.album && albumPorId(f.album);
    const esTapa = a && a.portada === idFoto(f);
    const des = (cond) => (cond ? "disabled" : "");
    ed.innerHTML =
      `<div class="editor__barra"><strong>${k >= 0 ? `Foto ${dos(k + 1)} de ${dos(lista.length)}` : "Foto"}</strong>` +
      `<button class="boton boton--sutil boton--icono" type="button" data-accion="editor-ant" aria-label="Foto anterior" ${des(k <= 0)}>‹</button>` +
      `<button class="boton boton--sutil boton--icono" type="button" data-accion="editor-sig" aria-label="Foto siguiente" ${des(k < 0 || k >= lista.length - 1)}>›</button>` +
      `<button class="boton boton--sutil boton--icono" type="button" data-accion="cerrar-editor" aria-label="Cerrar">✕</button></div>` +
      `<div class="editor__foto"><img alt=""></div>` +
      `<div class="editor__cuerpo">` +
      `<label class="campo"><span class="campo__etiqueta">Título</span><input data-foto="titulo" value="${esc(f.titulo)}" placeholder="${esc(tituloAuto(f))}" maxlength="90">` +
      `<span class="campo__ayuda">Si lo dejás vacío, se usa el nombre del álbum o de la carpeta.</span></label>` +
      `<div class="fila-campos" style="margin-top:.9rem">` +
      `<label class="campo"><span class="campo__etiqueta">Lugar</span><input data-foto="lugar" value="${esc(f.lugar)}" placeholder="Ej: Estadio Kempes" maxlength="60"></label>` +
      `<label class="campo"><span class="campo__etiqueta">Año</span><input data-foto="anio" value="${esc(f.anio)}" placeholder="${new Date().getFullYear()}" inputmode="numeric" maxlength="4"></label></div>` +
      `<div class="editor__grupo"><p class="editor__grupo-titulo">Dónde está</p>` +
      `<label class="campo"><span class="campo__etiqueta">Carpeta</span><select data-foto="carpeta">` +
      D().carpetas.map((c) => `<option value="${esc(c.id)}" ${c.id === f.carpeta ? "selected" : ""}>${esc(c.nombre)}</option>`).join("") +
      `</select></label>` +
      `<label class="campo"><span class="campo__etiqueta">Álbum</span><select data-foto="album"><option value="">Sin álbum</option>` +
      albs.map((x) => `<option value="${esc(x.id)}" ${x.id === f.album ? "selected" : ""}>${esc(x.titulo)}</option>`).join("") +
      `</select></label>` +
      (a ? `<button class="boton boton--chico" type="button" data-accion="tapa" style="margin-top:.8rem" aria-pressed="${!!esTapa}">${esTapa ? "★ Es la tapa del álbum" : "☆ Usar como tapa del álbum"}</button>` : "") +
      `</div>` +
      `<div class="editor__grupo"><p class="editor__grupo-titulo">Orden</p><div class="editor__botones">` +
      `<button class="boton boton--chico" type="button" data-accion="orden-primera" ${des(k <= 0)}>⇤ Primera</button>` +
      `<button class="boton boton--chico" type="button" data-accion="orden-antes" ${des(k <= 0)}>‹ Antes</button>` +
      `<button class="boton boton--chico" type="button" data-accion="orden-despues" ${des(k < 0 || k >= lista.length - 1)}>Después ›</button>` +
      `<button class="boton boton--chico" type="button" data-accion="orden-ultima" ${des(k < 0 || k >= lista.length - 1)}>Última ⇥</button></div></div>` +
      `<div class="editor__grupo editor__pie">` +
      `<a class="boton boton--chico" href="${SITIO}#foto/${esc(idFoto(f))}" target="_blank" rel="noopener">Ver en el sitio ↗</a>` +
      `<button class="boton boton--chico boton--peligro" type="button" data-accion="borrar-foto">Borrar foto</button></div>` +
      `<p class="editor__dato">${f.ancho && f.alto ? `${f.ancho} × ${f.alto} px · ` : ""}${esc(f.archivo)}</p></div>`;
    ponerImagen($(".editor__foto img", ed), f, { grande: true });
  }

  /* ---------- Ventanas ---------- */
  function abrirModal({ titulo, texto = "", cuerpo = "", aceptar = "Guardar", cancelar = "Cancelar", peligro = false, ancho = false, alAbrir }) {
    return new Promise((ok) => {
      const fondo = $("#modal");
      const caja = $(".modal", fondo);
      caja.className = `modal${ancho ? " modal--ancho" : ""}`;
      caja.innerHTML =
        `<form novalidate><h2 id="modal-titulo">${esc(titulo)}</h2>${texto ? `<p>${texto}</p>` : ""}${cuerpo}` +
        `<div class="modal__botones">${cancelar ? `<button class="boton" type="button" data-modal="no">${esc(cancelar)}</button>` : ""}` +
        `<button class="boton ${peligro ? "boton--peligro-lleno" : "boton--primario"}" type="submit">${esc(aceptar)}</button></div></form>`;
      const previo = document.activeElement;
      fondo.hidden = false;
      const form = $("form", caja);
      const tecla = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cerrar(null);
        }
      };
      function cerrar(valor) {
        fondo.hidden = true;
        document.removeEventListener("keydown", tecla, true);
        fondo.onclick = null;
        if (previo && previo.isConnected && previo.focus) previo.focus({ preventScroll: true });
        ok(valor);
      }
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const falta = $$("[required]", form).find((i) => !i.value.trim());
        if (falta) {
          falta.setAttribute("aria-invalid", "true");
          falta.focus();
          return;
        }
        cerrar(Object.fromEntries(new FormData(form)));
      });
      $('[data-modal="no"]', caja)?.addEventListener("click", () => cerrar(null));
      fondo.onclick = (e) => { if (e.target === fondo) cerrar(null); };
      document.addEventListener("keydown", tecla, true);
      if (alAbrir) alAbrir(caja);
      setTimeout(() => ($("input, textarea, select", form) || $('button[type="submit"]', form)).focus(), 40);
    });
  }

  const campoModal = (nombre, etiqueta, valor = "", { placeholder = "", requerido = false, ayuda = "", largo = 60 } = {}) =>
    `<label class="campo"><span class="campo__etiqueta">${etiqueta}</span>` +
    `<input name="${nombre}" value="${esc(valor)}" placeholder="${esc(placeholder)}" maxlength="${largo}" ${requerido ? "required" : ""}>` +
    (ayuda ? `<span class="campo__ayuda">${ayuda}</span>` : "") +
    "</label>";

  /* ---------- Acciones ---------- */
  function irA(v, { sinHistorial = false } = {}) {
    st.vista = v;
    st.elegidas.clear();
    if (st.editando) cerrarEditor();
    pintar();
    window.scrollTo(0, 0);
    if (!sinHistorial) {
      const h = v.tipo === "datos" ? "#datos" : `#${v.tipo}/${v.id}`;
      try { history.replaceState(null, "", h); } catch (e) { /* nada */ }
    }
  }

  const acciones = {
    "elegir-fotos": () => $("#elegir-fotos").click(),
    "elegir-perfil": () => $("#elegir-perfil").click(),
    reintentar: () => {
      st.error = null;
      encolar(guardarPendiente);
    },
    recargar: () => location.reload(),

    async "nueva-carpeta"() {
      const r = await abrirModal({
        titulo: "Nueva carpeta",
        texto: "Cada carpeta aparece en el sitio como una entrada para filtrar las fotos.",
        cuerpo:
          campoModal("nombre", "Nombre", "", { placeholder: "Ej: Recitales", requerido: true, largo: 30 }) +
          campoModal("sector", "Texto de la entrada (opcional)", "", { placeholder: "Ej: Campo", ayuda: "Va arriba del nombre en la entrada: “Sector …”.", largo: 24 }),
        aceptar: "Crear carpeta"
      });
      if (!r) return;
      const nombre = r.nombre.trim();
      const id = unico(slug(nombre), [...D().carpetas.map((c) => c.id), ...RESERVADOS]);
      D().carpetas.push({ id, nombre, sector: r.sector.trim() || nombre, proximo: 1 });
      cambio(`crea la carpeta ${nombre}`);
      irA({ tipo: "carpeta", id });
      aviso(`Carpeta “${nombre}” creada. Ya podés subirle fotos.`);
    },

    async "editar-carpeta"() {
      const c = carpetaActual();
      const r = await abrirModal({
        titulo: "Cambiar nombre",
        cuerpo:
          campoModal("nombre", "Nombre", c.nombre, { requerido: true, largo: 30 }) +
          campoModal("sector", "Texto de la entrada", c.sector, { ayuda: "Va arriba del nombre en la entrada: “Sector …”.", largo: 24 })
      });
      if (!r) return;
      c.nombre = r.nombre.trim();
      c.sector = r.sector.trim() || c.nombre;
      cambio(`renombra la carpeta ${c.nombre}`);
      pintar();
    },

    "carpeta-arriba": () => moverCarpeta(-1),
    "carpeta-abajo": () => moverCarpeta(1),

    async "borrar-carpeta"() {
      const c = carpetaActual();
      const n = fotosDe(c.id).length;
      if (n) {
        await abrirModal({
          titulo: "Primero, las fotos",
          texto: `“${esc(c.nombre)}” tiene ${plural(n, "foto", "fotos")}. Para borrar la carpeta, primero mové esas fotos a otra carpeta o borralas.`,
          aceptar: "Entendido",
          cancelar: ""
        });
        return;
      }
      const r = await abrirModal({
        titulo: "Borrar carpeta",
        texto: `¿Borrar la carpeta “${esc(c.nombre)}”? Está vacía, así que no se pierde ninguna foto.`,
        aceptar: "Borrar carpeta",
        peligro: true
      });
      if (!r) return;
      D().albumes = D().albumes.filter((a) => a.carpeta !== c.id);
      D().carpetas = D().carpetas.filter((x) => x !== c);
      cambio(`borra la carpeta ${c.nombre}`);
      irA(D().carpetas[0] ? { tipo: "carpeta", id: D().carpetas[0].id } : { tipo: "datos" });
    },

    async "nuevo-album"() {
      const c = carpetaActual();
      const elegidas = [...st.elegidas];
      const r = await abrirModal({
        titulo: "Nuevo álbum",
        texto: `Un álbum agrupa fotos de un mismo partido, recital o producción dentro de “${esc(c.nombre)}”, y tiene su propio link para compartir.`,
        cuerpo:
          campoModal("titulo", "Nombre del álbum", "", { placeholder: "Ej: Talleres vs. Belgrano", requerido: true, largo: 50 }) +
          campoModal("fecha", "Fecha (opcional)", "", { placeholder: "Ej: Octubre 2026", largo: 30 }) +
          campoModal("texto", "Descripción (opcional)", "", { placeholder: "Una línea que cuente de qué se trata", largo: 140 }),
        aceptar: "Crear álbum"
      });
      if (!r) return;
      const titulo = r.titulo.trim();
      const id = unico(slug(titulo), D().albumes.map((a) => a.id));
      D().albumes.push({ id, carpeta: c.id, titulo, fecha: r.fecha.trim(), texto: r.texto.trim(), portada: "" });
      if (elegidas.length) ponerEnAlbum(elegidas, id);
      cambio(`crea el álbum ${titulo}`);
      irA({ tipo: "album", id });
      aviso(`Álbum “${titulo}” creado. Subí fotos o agregá las que ya están en ${c.nombre}.`);
    },

    async "editar-album"() {
      const a = albumPorId(st.vista.id);
      const r = await abrirModal({
        titulo: "Editar álbum",
        cuerpo:
          campoModal("titulo", "Nombre del álbum", a.titulo, { requerido: true, largo: 50 }) +
          campoModal("fecha", "Fecha (opcional)", a.fecha, { largo: 30 }) +
          campoModal("texto", "Descripción (opcional)", a.texto, { largo: 140 })
      });
      if (!r) return;
      a.titulo = r.titulo.trim();
      a.fecha = r.fecha.trim();
      a.texto = r.texto.trim();
      cambio(`edita el álbum ${a.titulo}`);
      pintar();
    },

    async "borrar-album"() {
      const a = albumPorId(st.vista.id);
      const c = carpetaPorId(a.carpeta);
      const r = await abrirModal({
        titulo: "Borrar álbum",
        texto: `¿Borrar el álbum “${esc(a.titulo)}”? Las fotos no se borran: siguen en la carpeta “${esc(c.nombre)}”.`,
        aceptar: "Borrar álbum",
        peligro: true
      });
      if (!r) return;
      fotosDeAlbum(a.id).forEach((f) => { f.album = ""; });
      D().albumes = D().albumes.filter((x) => x !== a);
      cambio(`borra el álbum ${a.titulo}`);
      irA({ tipo: "carpeta", id: c.id });
    },

    async "agregar-al-album"() {
      const a = albumPorId(st.vista.id);
      const c = carpetaPorId(a.carpeta);
      const opciones = fotosDe(c.id).filter((f) => f.album !== a.id);
      if (!opciones.length) {
        aviso(`Todas las fotos de ${c.nombre} ya están en este álbum.`);
        return;
      }
      const elegidas = new Set();
      const r = await abrirModal({
        titulo: "Agregar fotos al álbum",
        texto: `Tocá las fotos de “${esc(c.nombre)}” que van en “${esc(a.titulo)}”.`,
        cuerpo: `<div class="elegir">${opciones.map((f, k) => `<button type="button" data-k="${k}" aria-pressed="false" aria-label="Foto ${k + 1}"><img alt="" loading="lazy"></button>`).join("")}</div>`,
        aceptar: "Agregar",
        ancho: true,
        alAbrir: (caja) => {
          $$(".elegir button", caja).forEach((b) => {
            const f = opciones[Number(b.dataset.k)];
            ponerImagen($("img", b), f);
            b.addEventListener("click", () => {
              if (elegidas.has(f)) elegidas.delete(f);
              else elegidas.add(f);
              b.setAttribute("aria-pressed", String(elegidas.has(f)));
              $('button[type="submit"]', caja).textContent = elegidas.size ? `Agregar ${plural(elegidas.size, "foto", "fotos")}` : "Agregar";
            });
          });
        }
      });
      if (!r || !elegidas.size) return;
      const n = ponerEnAlbum([...elegidas], a.id);
      pintar();
      aviso(`${plural(n, "foto agregada", "fotos agregadas")} a “${a.titulo}”.`);
    },

    "cerrar-editor": cerrarEditor,
    "editor-ant": () => navegarEditor(-1),
    "editor-sig": () => navegarEditor(1),
    tapa() {
      const f = st.editando;
      const a = albumPorId(f.album);
      if (!a) return;
      a.portada = a.portada === idFoto(f) ? "" : idFoto(f);
      cambio(`cambia la tapa del álbum ${a.titulo}`);
      pintarGrillaActual();
      pintarEditor();
    },
    "orden-primera": () => moverEnVista(st.editando, 0),
    "orden-antes": () => moverEnVista(st.editando, fotosVista().indexOf(st.editando) - 1),
    "orden-despues": () => moverEnVista(st.editando, fotosVista().indexOf(st.editando) + 1),
    "orden-ultima": () => moverEnVista(st.editando, fotosVista().length),
    async "borrar-foto"() {
      const f = st.editando;
      const r = await abrirModal({
        titulo: "Borrar foto",
        texto: "¿Borrar esta foto? Se saca del sitio y no se puede recuperar desde el panel.",
        aceptar: "Borrar foto",
        peligro: true
      });
      if (!r) return;
      const lista = fotosVista();
      const sig = lista[lista.indexOf(f) + 1] || lista[lista.indexOf(f) - 1];
      borrarFotos([f]);
      pintar();
      if (sig) abrirEditor(sig);
      aviso("Foto borrada.");
    },

    async "borrar-elegidas"() {
      const lista = [...st.elegidas];
      const r = await abrirModal({
        titulo: `Borrar ${plural(lista.length, "foto", "fotos")}`,
        texto:
          lista.length === 1
            ? "¿Borrar la foto elegida? Se saca del sitio y no se puede recuperar desde el panel."
            : `¿Borrar las ${lista.length} fotos elegidas? Se sacan del sitio y no se pueden recuperar desde el panel.`,
        aceptar: "Borrar",
        peligro: true
      });
      if (!r) return;
      borrarFotos(lista);
      st.elegidas.clear();
      pintar();
      aviso(`${plural(lista.length, "foto borrada", "fotos borradas")}.`);
    },
    "elegir-todas": () => {
      fotosVista().forEach((f) => st.elegidas.add(f));
      pintarGrillaActual();
      pintarSeleccion();
    },
    "cancelar-eleccion": () => {
      st.elegidas.clear();
      pintarGrillaActual();
      pintarSeleccion();
    },
    "sacar-album": () => {
      const n = ponerEnAlbum([...st.elegidas], "");
      st.elegidas.clear();
      pintar();
      aviso(`${plural(n, "foto sacada", "fotos sacadas")} del álbum. Siguen en la carpeta.`);
    }
  };

  const alCambiar = {
    "mover-a"(valor) {
      const destino = carpetaPorId(valor);
      const n = moverACarpeta([...st.elegidas], valor);
      st.elegidas.clear();
      pintar();
      if (n) aviso(`${plural(n, "foto movida", "fotos movidas")} a ${destino.nombre}.`);
    },
    "poner-album"(valor) {
      const a = albumPorId(valor);
      const n = ponerEnAlbum([...st.elegidas], valor);
      st.elegidas.clear();
      pintar();
      if (n) aviso(`${plural(n, "foto agregada", "fotos agregadas")} a “${a.titulo}”.`);
    }
  };

  function moverCarpeta(delta) {
    const lista = D().carpetas;
    const c = carpetaActual();
    const i = lista.indexOf(c);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    cambio("cambia el orden de las carpetas");
    pintar();
  }

  function navegarEditor(delta) {
    const lista = fotosVista();
    const k = lista.indexOf(st.editando);
    const sig = lista[k + delta];
    if (sig) {
      st.editando = sig;
      pintarEditor();
      tarjetas.get(sig)?.scrollIntoView({ block: "nearest" });
    }
  }

  /* ---------- Arrastrar para ordenar (mouse) ---------- */
  function activarArrastre() {
    let a = null;
    const main = $("#principal");
    main.addEventListener("dragstart", (e) => { if (e.target.closest && e.target.closest(".tarjeta")) e.preventDefault(); });
    main.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch" || e.button !== 0 || st.elegidas.size) return;
      const t = e.target.closest(".tarjeta");
      if (!t || !t._foto || e.target.closest(".tarjeta__marcar")) return;
      a = { t, x: e.clientX, y: e.clientY, activo: false, vy: 0 };
    });
    window.addEventListener("pointermove", (e) => {
      if (!a) return;
      if (!a.activo) {
        if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 7) return;
        empezar();
      }
      e.preventDefault();
      a.fantasma.style.left = `${e.clientX - 70}px`;
      a.fantasma.style.top = `${e.clientY - 70}px`;
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      const destino = bajo && bajo.closest(".tarjeta");
      if (destino && destino !== a.t && destino._foto && destino.parentNode === a.t.parentNode) {
        const r = destino.getBoundingClientRect();
        const antes = e.clientX < r.left + r.width / 2;
        const ref = antes ? destino : destino.nextSibling;
        if (ref !== a.t && a.t.nextSibling !== ref) destino.parentNode.insertBefore(a.t, ref);
      }
      a.vy = e.clientY < 110 ? -14 : e.clientY > innerHeight - 80 ? 14 : 0;
    });
    const terminar = () => {
      if (!a) return;
      const fin = a;
      a = null;
      if (!fin.activo) return;
      cancelAnimationFrame(fin.raf);
      fin.fantasma.remove();
      fin.t.classList.remove("tarjeta--arrastrada");
      document.body.style.cursor = "";
      st.recienArrastrado = true;
      setTimeout(() => { st.recienArrastrado = false; }, 60);
      const lista = fotosVista();
      const nueva = $$(".tarjeta", $("#grilla")).map((x) => x._foto).filter(Boolean);
      if (nueva.length === lista.length && nueva.some((f, i) => f !== lista[i])) reordenar(lista, nueva);
      pintarGrilla(fotosVista());
    };
    window.addEventListener("pointerup", terminar);
    window.addEventListener("pointercancel", terminar);
    function empezar() {
      a.activo = true;
      a.t.classList.add("tarjeta--arrastrada");
      a.fantasma = document.createElement("div");
      a.fantasma.className = "fantasma";
      a.fantasma.append($("img", a.t).cloneNode());
      document.body.append(a.fantasma);
      document.body.style.cursor = "grabbing";
      const paso = () => {
        if (!a || !a.activo) return;
        if (a.vy) window.scrollBy(0, a.vy);
        a.raf = requestAnimationFrame(paso);
      };
      a.raf = requestAnimationFrame(paso);
    }
  }

  /* ---------- Aviso ---------- */
  let avisoTimer = 0;
  function aviso(texto) {
    const el = $("#aviso");
    el.textContent = texto;
    el.classList.add("visible");
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => el.classList.remove("visible"), 4200);
  }

  /* ---------- Eventos ---------- */
  function activarEventos() {
    document.addEventListener("click", (e) => {
      const ir = e.target.closest("[data-ir]");
      if (ir) {
        const [tipo, id] = ir.dataset.ir.split(":");
        irA({ tipo, id });
        return;
      }
      const ac = e.target.closest("[data-accion]");
      if (ac && !ac.disabled && acciones[ac.dataset.accion]) {
        acciones[ac.dataset.accion](ac, e);
        return;
      }
      const marcar = e.target.closest(".tarjeta__marcar");
      if (marcar) {
        const t = marcar.closest(".tarjeta");
        if (t && t._foto) alternarEleccion(t._foto);
        return;
      }
      const t = e.target.closest(".tarjeta");
      if (t && t._foto && !st.recienArrastrado) {
        if (st.elegidas.size) alternarEleccion(t._foto);
        else abrirEditor(t._foto);
      }
    });

    document.addEventListener("keydown", (e) => {
      const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "Enter" && !enCampo) {
        const t = e.target.closest && e.target.closest(".tarjeta");
        if (t && t._foto && e.target === t) {
          e.preventDefault();
          abrirEditor(t._foto);
          return;
        }
        if (e.target.classList && e.target.classList.contains("subir")) {
          e.preventDefault();
          $("#elegir-fotos").click();
          return;
        }
      }
      if (!st.editando || !$("#modal").hidden) return;
      if (e.key === "Escape") cerrarEditor();
      else if (!enCampo && e.key === "ArrowLeft") navegarEditor(-1);
      else if (!enCampo && e.key === "ArrowRight") navegarEditor(1);
    });

    $("#editor-fondo").addEventListener("click", cerrarEditor);

    // campos del editor de foto
    $("#editor").addEventListener("input", (e) => {
      const campo = e.target.dataset.foto;
      const f = st.editando;
      if (!f || !campo || e.target.tagName === "SELECT") return;
      f[campo] = e.target.value.trim() ? e.target.value : "";
      const t = tarjetas.get(f);
      if (t) tarjetaFoto(f, fotosVista().indexOf(f));
      cambio("edita datos de las fotos");
    });
    $("#editor").addEventListener("change", (e) => {
      const campo = e.target.dataset.foto;
      const f = st.editando;
      if (!f || !campo) return;
      if (campo === "carpeta") {
        const destino = carpetaPorId(e.target.value);
        moverACarpeta([f], e.target.value);
        pintar();
        pintarEditor();
        aviso(`Foto movida a ${destino.nombre}.`);
      } else if (campo === "album") {
        ponerEnAlbum([f], e.target.value);
        pintar();
        pintarEditor();
      } else if (campo === "anio") {
        f.anio = e.target.value.replace(/\D/g, "").slice(0, 4);
        e.target.value = f.anio;
      }
    });

    // datos del sitio
    $("#principal").addEventListener("input", (e) => {
      const clave = e.target.dataset.dato;
      if (clave) guardarDato(clave, e.target.value);
    });

    // barra de selección
    $("#seleccion").addEventListener("change", (e) => {
      const accion = e.target.dataset.cambio;
      if (accion && e.target.value && alCambiar[accion]) alCambiar[accion](e.target.value);
    });

    // elegir y soltar fotos
    $("#elegir-fotos").addEventListener("change", (e) => {
      subirFotos(e.target.files);
      e.target.value = "";
    });
    $("#elegir-perfil").addEventListener("change", (e) => {
      subirPerfil(e.target.files[0]);
      e.target.value = "";
    });
    const main = $("#principal");
    const conArchivos = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
    main.addEventListener("dragover", (e) => {
      if (!conArchivos(e) || !carpetaActual()) return;
      e.preventDefault();
      $(".subir", main)?.classList.add("encima");
    });
    main.addEventListener("dragleave", (e) => {
      if (!main.contains(e.relatedTarget)) $(".subir", main)?.classList.remove("encima");
    });
    main.addEventListener("drop", (e) => {
      if (!conArchivos(e) || !carpetaActual()) return;
      e.preventDefault();
      $(".subir", main)?.classList.remove("encima");
      subirFotos(e.dataTransfer.files);
    });

    $("#salir").addEventListener("click", async () => {
      if (st.sucio || st.trabajando) {
        const r = await abrirModal({ titulo: "Todavía se está guardando", texto: "Esperá a que diga “Todo guardado” para salir, así no se pierde nada.", aceptar: "Salir igual", peligro: true });
        if (!r) return;
      }
      try { localStorage.removeItem(LLAVE); } catch (e) { /* nada */ }
      location.hash = "";
      location.reload();
    });

    window.addEventListener("beforeunload", (e) => {
      if (st.sucio || st.trabajando) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    setInterval(pintarEstado, 20000);
    activarArrastre();
  }

  /* ---------- Entrar ---------- */
  function mensajeError(e) {
    if (!e) return "";
    if (e.status === 401) return "La clave no es válida o ya venció.";
    if (e.status === 403) return "La clave no tiene permiso para este sitio.";
    if (e.status === 404) return "La clave no tiene acceso al repositorio del sitio.";
    if (e.status === 0) return "No hay conexión con GitHub. Revisá internet y probá de nuevo.";
    return e.message || "No se pudo entrar.";
  }

  function mostrarIngreso(error = "") {
    $("#cargando").hidden = true;
    $("#panel").hidden = true;
    $("#ingreso").hidden = false;
    $("#ingreso-error").textContent = error;
    setTimeout(() => $("#ingreso-clave").focus(), 30);
  }

  function vistaDesdeHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === "datos") return { tipo: "datos", id: "" };
    const [tipo, id] = h.split("/");
    if (tipo === "carpeta" && carpetaPorId(id)) return { tipo, id };
    if (tipo === "album" && albumPorId(id)) return { tipo, id };
    return D().carpetas[0] ? { tipo: "carpeta", id: D().carpetas[0].id } : { tipo: "datos", id: "" };
  }

  async function entrar() {
    $("#cargando").hidden = false;
    $("#ingreso").hidden = true;
    await pedir("GET", REPO);
    await cargarRepo();
    st.vista = vistaDesdeHash();
    $("#barra-repo").textContent = CFG.local ? "Modo local · los cambios quedan en esta compu" : `${CFG.owner}/${CFG.repo}`;
    $("#ver-sitio").href = SITIO;
    $("#cargando").hidden = true;
    $("#panel").hidden = false;
    pintar();
  }

  async function iniciar() {
    activarEventos();
    $("#ingreso-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const clave = $("#ingreso-clave").value.trim();
      if (!clave) return;
      const boton = $("#ingreso-boton");
      boton.disabled = true;
      boton.textContent = "Entrando…";
      st.clave = clave;
      try {
        await entrar();
        try { localStorage.setItem(LLAVE, clave); } catch (err) { /* sin guardar */ }
      } catch (err) {
        mostrarIngreso(mensajeError(err));
      } finally {
        boton.disabled = false;
        boton.textContent = "Entrar";
      }
    });

    if (!CFG.owner || !CFG.repo) {
      mostrarIngreso("El panel todavía no está conectado al repositorio del sitio (falta completar admin/config.js).");
      $("#ingreso-boton").disabled = true;
      return;
    }
    let guardada = "";
    try { guardada = localStorage.getItem(LLAVE) || ""; } catch (e) { /* nada */ }
    if (CFG.local && !guardada) guardada = "local";
    if (!guardada) {
      mostrarIngreso();
      return;
    }
    st.clave = guardada;
    try {
      await entrar();
    } catch (e) {
      if (e.status === 401) {
        try { localStorage.removeItem(LLAVE); } catch (err) { /* nada */ }
      }
      mostrarIngreso(mensajeError(e));
    }
  }

  iniciar();
})();
