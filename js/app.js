/* =========================================================
   SABRINA · FOTOGRAFÍA — interacciones
   (el contenido viene de datos/sitio.json, que se edita desde el panel /admin;
   js/datos.js lo carga y después carga este archivo)
   ========================================================= */
(() => {
  "use strict";

  const D = window.SABRINA || {};
  D.fotos = Array.isArray(D.fotos) ? D.fotos : [];
  D.categorias = Array.isArray(D.categorias) ? D.categorias : [];

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const azar = (a, b) => a + Math.random() * (b - a);
  const dos = (n) => String(n).padStart(2, "0");
  const nro = (i) => dos(i + 1);
  const esc = (t) =>
    String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const RATIOS = { vertical: 4 / 5, horizontal: 3 / 2, cuadrada: 1, panoramica: 2 };
  const fotosTexto = (n) => `${n} ${n === 1 ? "foto" : "fotos"}`;
  const nombreCategoria = (id) => (D.categorias.find((c) => c.id === id) || {}).nombre || id || "";

  // cada foto tiene un código para su link: "fotos/talleres/04.jpg" → "talleres-04"
  const idFoto = (f) => f.id || (f.archivo || "").replace(/^fotos\//, "").replace(/\.[a-z]+$/i, "").replace(/\//g, "-");
  // miniatura liviana para la pared: "fotos/talleres/04.jpg" → "fotos/talleres/mini/04.jpg"
  const rutaMini = (f) => f.mini || (f.archivo || "").replace(/\/([^/]+)$/, "/mini/$1");
  const linkA = (ruta) => `${location.href.split("#")[0]}#${ruta}`;
  const ponerRuta = (ruta) => {
    try {
      history.replaceState(null, "", ruta ? `#${ruta}` : location.pathname + location.search);
    } catch (e) { /* file:// en algunos navegadores */ }
  };

  /* ---------- Aparecer al hacer scroll ---------- */
  const claseVisible = (el) => (el.classList.contains("afiche") ? "pegado" : "visto");
  const observador =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entradas) => {
            entradas.forEach((e) => {
              if (!e.isIntersecting) return;
              e.target.classList.add(claseVisible(e.target));
              observador.unobserve(e.target);
            });
          },
          { rootMargin: "0px 0px -6% 0px", threshold: 0.1 }
        )
      : null;
  const observar = (el) => (observador ? observador.observe(el) : el.classList.add(claseVisible(el)));

  /* ---------- Flash de cámara ---------- */
  function disparar(intensidad = 0.9) {
    if (quieto) return;
    const f = $(".flash");
    if (!f) return;
    f.style.setProperty("--intensidad", intensidad);
    f.classList.remove("disparo");
    void f.offsetWidth;
    f.classList.add("disparo");
  }

  /* ---------- Contador de visitas (GoatCounter, opcional) ---------- */
  function armarEstadisticas() {
    const codigo = ((D.estadisticas || {}).goatcounter || "").trim();
    const local = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (!codigo || local) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = `https://${encodeURIComponent(codigo)}.goatcounter.com/count`;
    document.head.append(s);
  }

  // cuenta acciones (compartir, pedidos, presentación) si el contador está activo
  function contar(evento) {
    try {
      if (window.goatcounter && typeof window.goatcounter.count === "function") {
        window.goatcounter.count({ path: evento, title: evento, event: true });
      }
    } catch (e) { /* sin contador no pasa nada */ }
  }

  /* ---------- Aviso flotante y compartir ---------- */
  let avisoTimer = 0;
  function avisoFlotante(texto) {
    const el = $("#aviso-flotante");
    if (!el) return;
    el.textContent = texto;
    el.classList.add("visible");
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => el.classList.remove("visible"), 2800);
  }

  // en el celu abre el menú de compartir del teléfono; en la compu copia el link
  async function compartir(datos, evento) {
    contar(evento);
    if (navigator.share) {
      try {
        await navigator.share(datos);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(datos.url);
      avisoFlotante("Link copiado. Pegalo donde quieras.");
    } catch (e) {
      window.prompt("Copiá este link:", datos.url);
    }
  }

  /* ---------- Textos desde datos/sitio.json ---------- */
  function completarTextos() {
    $$("[data-campo]").forEach((el) => {
      const valor = D[el.dataset.campo];
      if (typeof valor === "string" && valor.trim()) el.textContent = valor;
    });
    if (!D.nombreCompleto) D.nombreCompleto = D.nombre;
    $$('[data-campo="nombreCompleto"]').forEach((el) => { if (D.nombreCompleto) el.textContent = D.nombreCompleto; });
    if (D.nombreCompleto) document.title = `${D.nombreCompleto} · Fotografía${D.ciudad ? " · " + D.ciudad : ""}`;

    const bajada = $("#bajada");
    if (bajada && D.bajada) bajada.innerHTML = esc(D.bajada).replace(/\*(.+?)\*/g, "<em>$1</em>");

    const bio = $("#bio");
    if (bio && Array.isArray(D.bio)) bio.innerHTML = D.bio.map((p) => `<p>${esc(p)}</p>`).join("");


    const inicial = $("#credencial-foto span");
    if (inicial && D.nombre) inicial.textContent = D.nombre.trim().charAt(0).toUpperCase();

    const anio = $("#anio");
    if (anio) anio.textContent = new Date().getFullYear();
  }

  /* ---------- Tablero LED ---------- */
  function armarTablero() {
    const pista = $("#tablero");
    if (!pista) return;
    const hoy = new Date();
    const dia = hoy.getDate();
    const mes = hoy.getMonth() + 1;
    const items = [];
    if (mes === 10 && dia === 17) items.push("Feliz Día de la Lealtad");
    if (mes === 10 && dia === 12) items.push("Feliz cumple, Matador");
    items.push(D.nombre || "Sabrina", "Fotografía", ...D.categorias.map((c) => c.nombre), D.ciudad);
    if (Array.isArray(D.tablero)) items.push(...D.tablero);
    const tramo = items
      .filter(Boolean)
      .map((t) => `<span>${esc(t)}</span><b>★</b>`)
      .join("");
    const largo = tramo + tramo + tramo;
    pista.innerHTML = `<div class="tablero__tramo">${largo}</div><div class="tablero__tramo">${largo}</div>`;
  }

  /* ---------- Lista de temas ---------- */
  function armarSetlist() {
    const boton = $(".setlist__boton");
    const hoja = $("#setlist-hoja");
    if (!boton || !hoja) return;
    const abrir = (si) => {
      boton.setAttribute("aria-expanded", String(si));
      hoja.classList.toggle("abierta", si);
    };
    boton.addEventListener("click", () => abrir(boton.getAttribute("aria-expanded") !== "true"));
    $$("a", hoja).forEach((a) => a.addEventListener("click", () => abrir(false)));
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".setlist")) abrir(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && boton.getAttribute("aria-expanded") === "true") {
        abrir(false);
        boton.focus();
      }
    });
  }

  /* ---------- El público (siluetas con manos arriba y alguna V) ---------- */
  function armarPublico() {
    const svg = $("#publico");
    if (!svg) return;
    const W = 1600;
    const H = 360;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const filas = [
      { base: H - 78, r: 17, n: 46, color: "#0e111c" },
      { base: H - 18, r: 26, n: 30, color: "#050508" }
    ];
    const f1 = (n) => n.toFixed(1);
    let salida = "";
    filas.forEach((fila) => {
      let cuerpos = "";
      let brazos = "";
      const paso = W / fila.n;
      for (let i = -1; i <= fila.n; i++) {
        const x = i * paso + paso / 2 + azar(-paso * 0.3, paso * 0.3);
        const r = fila.r * azar(0.85, 1.15);
        const yCab = fila.base - r * azar(1.6, 2.4);
        cuerpos += `<circle cx="${f1(x)}" cy="${f1(yCab)}" r="${f1(r)}"/>`;
        cuerpos += `<ellipse cx="${f1(x)}" cy="${f1(yCab + r * 2.1)}" rx="${f1(r * 1.9)}" ry="${f1(r * 1.4)}"/>`;
        if (Math.random() < 0.4) {
          const lado = Math.random() < 0.5 ? -1 : 1;
          const hx = x + lado * r * 1.25;
          const hy = yCab + r * 1.4;
          const mx = hx + lado * r * azar(0.2, 1.1);
          const my = yCab - r * azar(2.3, 4.2);
          brazos += `<path d="M${f1(hx)} ${f1(hy)} L${f1(mx)} ${f1(my)}" stroke-width="${f1(r * 0.55)}"/>`;
          if (Math.random() < 0.35) {
            const l = r * 0.95;
            brazos += `<path d="M${f1(mx)} ${f1(my)} l${f1(-l * 0.42)} ${f1(-l)} M${f1(mx)} ${f1(my)} l${f1(l * 0.42)} ${f1(-l)}" stroke-width="${f1(r * 0.24)}"/>`;
          } else {
            brazos += `<circle cx="${f1(mx)}" cy="${f1(my)}" r="${f1(r * 0.42)}"/>`;
          }
        }
      }
      salida += `<g fill="${fila.color}" stroke="${fila.color}" stroke-linecap="round">${brazos}${cuerpos}<rect x="0" y="${fila.base}" width="${W}" height="${H - fila.base + 2}"/></g>`;
    });
    svg.innerHTML = salida;
  }

  /* ---------- Fotos ---------- */
  function crearVacia(f, i) {
    const d = document.createElement("div");
    d.className = "foto-vacia";
    d.innerHTML =
      `<span class="foto-vacia__cuadro">▸ ${nro(i)}A</span>` +
      `<span class="foto-vacia__texto">Sin revelar</span>` +
      `<span class="foto-vacia__cat">${esc(nombreCategoria(f.categoria))}</span>` +
      `<code class="foto-vacia__archivo">${esc(f.archivo || "sin archivo")}</code>`;
    return d;
  }

  // grande: visor (foto completa + firma) · chica: pared y tira (miniatura) · mini: tira (sin proporción propia)
  function crearFoto(f, i, { grande = false, mini = false, chica = false } = {}) {
    const caja = document.createElement("div");
    caja.className = "foto";
    if (!mini) caja.style.setProperty("--ar", f.ar || RATIOS[f.formato] || RATIOS.vertical);
    if (!f.archivo) {
      caja.append(crearVacia(f, i));
      return caja;
    }
    const img = new Image();
    img.alt = f.alt || f.titulo || "";
    img.decoding = "async";
    if (!grande) img.loading = "lazy";
    // si falta la miniatura, se usa la grande; si falta la grande, el negativo vacío
    const fuentes = chica ? [rutaMini(f), f.archivo] : [f.archivo];
    let intento = 0;
    img.addEventListener(
      "load",
      () => {
        if (!mini && img.naturalWidth) caja.style.setProperty("--ar", img.naturalWidth / img.naturalHeight);
        img.classList.add("cargada");
      },
      { once: true }
    );
    img.addEventListener("error", () => {
      intento += 1;
      if (intento < fuentes.length) img.src = fuentes[intento];
      else img.replaceWith(crearVacia(f, i));
    });
    img.src = fuentes[0];
    caja.append(img);
    if (grande && D.firma) {
      const firma = document.createElement("span");
      firma.className = "firma";
      firma.setAttribute("aria-hidden", "true");
      firma.textContent = D.firma;
      caja.append(firma);
    }
    return caja;
  }

  const estado = { filtro: "todas", album: null };
  const fotoEntra = (i) => {
    if (estado.album) return estado.album.indices.has(i);
    return estado.filtro === "todas" || D.fotos[i].categoria === estado.filtro;
  };
  const indicesVisibles = () => D.fotos.map((_, i) => i).filter(fotoEntra);

  function armarEntradas() {
    const cont = $("#entradas");
    if (!cont) return;
    const anio = new Date().getFullYear();
    const lista = [{ id: "todas", nombre: "Todas", sector: "General" }, ...D.categorias];
    lista.forEach((c, k) => {
      const cantidad = c.id === "todas" ? D.fotos.length : D.fotos.filter((f) => f.categoria === c.id).length;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "entrada";
      b.dataset.filtro = c.id;
      b.setAttribute("aria-pressed", String(c.id === "todas"));
      b.setAttribute("aria-label", `${c.nombre}: ${fotosTexto(cantidad)}`);
      b.innerHTML =
        `<span class="entrada__papel">` +
        `<span class="entrada__cuerpo">` +
        `<span class="entrada__tipo">${c.id === "todas" ? "Entrada general" : "Sector " + esc(c.sector || c.nombre)}</span>` +
        `<span class="entrada__nombre">${esc(c.nombre)}</span>` +
        `<span class="entrada__fila">Fila ${String.fromCharCode(65 + k)} · ${anio}</span>` +
        `</span>` +
        `<span class="entrada__talon"><span class="entrada__num">${dos(cantidad)}</span><span class="entrada__mini">${cantidad === 1 ? "foto" : "fotos"}</span></span>` +
        `</span>` +
        `<span class="entrada__sello" aria-hidden="true">Adentro</span>`;
      b.addEventListener("click", () => filtrar(c.id));
      cont.append(b);
    });
  }

  function armarGrilla() {
    const grilla = $("#grilla");
    if (!grilla) return;
    D.fotos.forEach((f, i) => {
      const fig = document.createElement("figure");
      fig.className = "afiche";
      fig.dataset.categoria = f.categoria || "";
      fig.dataset.indice = i;
      fig.id = `foto-${idFoto(f)}`;
      fig.style.setProperty("--giro", `${azar(-2.6, 2.6).toFixed(2)}deg`);
      fig.style.setProperty("--cinta", `${azar(-7, 7).toFixed(1)}deg`);
      fig.style.setProperty("--retraso", `${azar(0, 0.35).toFixed(2)}s`);

      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "afiche__boton";
      boton.setAttribute("aria-label", `Ver en grande: ${f.titulo || "foto " + nro(i)}`);
      boton.append(crearFoto(f, i, { chica: true }));
      boton.addEventListener("click", () => abrirVisor(i));

      const pie = document.createElement("figcaption");
      const datos = [f.lugar, f.anio].filter(Boolean).join(" · ");
      pie.innerHTML =
        `<span class="afiche__nro">${nro(i)}</span>` +
        `<span class="afiche__titulo">${esc(f.titulo || "Sin título")}</span>` +
        (datos ? `<span class="afiche__lugar">${esc(datos)}</span>` : "");

      fig.append(boton, pie);
      grilla.append(fig);
      observar(fig);
    });
    // cuando carga una foto real (cambia su proporción) se reacomoda la pared
    grilla.addEventListener("load", acomodar, true);
    grilla.addEventListener("error", acomodar, true);
    window.addEventListener("resize", acomodar);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(acomodar);
    acomodar();
  }

  /* masonry: cada afiche ocupa tantas filas de 6px como mide (mantiene el orden 01, 02, 03… de izquierda a derecha) */
  let pedidoAcomodo = 0;
  function acomodar() {
    cancelAnimationFrame(pedidoAcomodo);
    pedidoAcomodo = requestAnimationFrame(() => {
      const grilla = $("#grilla");
      if (!grilla) return;
      const fila = parseFloat(getComputedStyle(grilla).gridAutoRows) || 6;
      $$(".afiche", grilla).forEach((a) => {
        if (a.hidden) return;
        const margen = parseFloat(getComputedStyle(a).marginBottom) || 0;
        a.style.gridRowEnd = `span ${Math.ceil((a.offsetHeight + margen) / fila)}`;
      });
    });
  }

  function aplicarFiltro() {
    $$(".afiche").forEach((a) => {
      const entra = fotoEntra(Number(a.dataset.indice));
      a.hidden = !entra;
      if (entra) {
        a.classList.remove("pegado");
        void a.offsetWidth;
        a.classList.add("pegado");
      }
    });
    acomodar();
  }

  function filtrar(id) {
    estado.filtro = id;
    estado.album = null;
    $$(".entrada").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filtro === id)));
    mostrarCabeceraAlbum();
    aplicarFiltro();
    if (location.hash.startsWith("#album/")) ponerRuta("");
  }

  /* ---------- Álbumes por evento ---------- */
  const albumes = (Array.isArray(D.albumes) ? D.albumes : [])
    .map((a) => {
      const lista = (a.fotos || [])
        .map((id) => D.fotos.findIndex((f) => idFoto(f) === id))
        .filter((i) => i >= 0);
      return { ...a, lista, indices: new Set(lista) };
    })
    .filter((a) => a.id && a.lista.length);

  function armarAlbumes() {
    const cont = $("#albumes");
    const lista = $("#albumes-lista");
    if (!cont || !lista || !albumes.length) return;
    cont.hidden = false;
    albumes.forEach((a, k) => {
      const iPortada = a.portada ? D.fotos.findIndex((f) => idFoto(f) === a.portada) : -1;
      const portada = D.fotos[iPortada >= 0 ? iPortada : a.lista[0]];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sobre";
      b.dataset.album = a.id;
      b.setAttribute("aria-pressed", "false");
      b.style.setProperty("--g", `${[-1.5, 1.2, -0.6, 1.8][k % 4]}deg`);
      b.innerHTML =
        `<span class="sobre__foto"><img alt="" loading="lazy" decoding="async"></span>` +
        `<span class="sobre__papel">` +
        `<span class="sobre__marca">Revelado · copias</span>` +
        `<span class="sobre__titulo">${esc(a.titulo)}</span>` +
        `<span class="sobre__datos">${esc([a.fecha, fotosTexto(a.lista.length)].filter(Boolean).join(" · "))}</span>` +
        `</span>`;
      const img = $("img", b);
      img.addEventListener("error", () => { if (img.src.indexOf("/mini/") > -1) img.src = portada.archivo; }, { once: true });
      img.src = rutaMini(portada);
      b.addEventListener("click", () => abrirAlbum(a.id));
      lista.append(b);
    });
    $("#album-salir").addEventListener("click", () => filtrar("todas"));
    $("#album-compartir").addEventListener("click", () => {
      const a = estado.album;
      if (!a) return;
      compartir(
        { title: `${a.titulo} · ${D.nombreCompleto}`, text: `Álbum de fotos de ${D.nombreCompleto}: ${a.titulo}`, url: linkA(`album/${a.id}`) },
        "compartir-album"
      );
    });
  }

  function mostrarCabeceraAlbum() {
    const cab = $("#album-cabecera");
    if (!cab) return;
    const a = estado.album;
    $$(".sobre").forEach((s) => s.setAttribute("aria-pressed", String(!!a && s.dataset.album === a.id)));
    cab.hidden = !a;
    if (!a) return;
    $("#album-titulo").textContent = a.titulo;
    $("#album-texto").textContent = [a.fecha, fotosTexto(a.lista.length), a.texto].filter(Boolean).join(" · ");
  }

  function abrirAlbum(id, { desplazar = true } = {}) {
    const a = albumes.find((x) => x.id === id);
    if (!a) return false;
    estado.album = a;
    estado.filtro = null;
    $$(".entrada").forEach((b) => b.setAttribute("aria-pressed", "false"));
    mostrarCabeceraAlbum();
    aplicarFiltro();
    ponerRuta(`album/${a.id}`);
    if (desplazar) $("#album-cabecera").scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
    return true;
  }


  /* ---------- Visor ---------- */
  const visor = { el: null, lista: [], pos: 0, foco: null, timer: 0 };

  function armarVisor() {
    visor.el = $("#visor");
    if (!visor.el) return;
    $("#visor-cerrar").addEventListener("click", cerrarVisor);
    $("#visor-ant").addEventListener("click", () => mover(-1));
    $("#visor-sig").addEventListener("click", () => mover(1));
    $("#visor-compartir").addEventListener("click", () => {
      const f = D.fotos[visor.lista[visor.pos]];
      if (!f) return;
      compartir(
        { title: `${f.titulo || "Foto"} · ${D.nombreCompleto}`, text: `Foto de ${D.nombreCompleto}`, url: linkA(`foto/${idFoto(f)}`) },
        "compartir-foto"
      );
    });
    $("#visor-presentacion").addEventListener("click", () =>
      presentacion.activa ? detenerPresentacion() : iniciarPresentacion()
    );
    const enPared = $("#presentacion-pared");
    if (enPared) enPared.addEventListener("click", iniciarPresentacion);
    document.addEventListener("fullscreenchange", () => {
      // al salir de pantalla completa (por ejemplo con Esc) se frena la presentación
      if (!document.fullscreenElement && presentacion.pantallaCompleta) {
        presentacion.pantallaCompleta = false;
        detenerPresentacion();
      }
    });

    const escena = $("#visor-escena");
    escena.addEventListener("click", (e) => {
      if (e.target === escena) cerrarVisor();
    });
    let x0 = null;
    escena.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
    escena.addEventListener("pointerup", (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1);
    });

    document.addEventListener("keydown", (e) => {
      if (visor.el.hidden) return;
      if (e.key === "Escape") cerrarVisor();
      else if (e.key === "ArrowRight") mover(1);
      else if (e.key === "ArrowLeft") mover(-1);
      else if (e.key === "Tab") {
        const enfocables = $$("button", visor.el);
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    });
  }

  function armarTira() {
    const tira = $("#visor-tira");
    tira.replaceChildren(
      ...visor.lista.map((i, k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cuadrito";
        b.setAttribute("aria-label", `Ir a ${D.fotos[i].titulo || "foto " + nro(i)}`);
        b.append(crearFoto(D.fotos[i], i, { mini: true, chica: true }));
        const n = document.createElement("span");
        n.className = "cuadrito__nro";
        n.textContent = `${nro(k)}A`;
        b.append(n);
        b.addEventListener("click", () => {
          visor.pos = k;
          mostrarEnVisor();
        });
        return b;
      })
    );
  }

  function mostrarEnVisor() {
    const i = visor.lista[visor.pos];
    const f = D.fotos[i];
    $("#visor-foto").replaceChildren(crearFoto(f, i, { grande: true }));
    $("#visor-titulo").textContent = f.titulo || `Foto ${nro(i)}`;
    const cat = nombreCategoria(f.categoria);
    const titulo = f.titulo || "";
    $("#visor-datos").textContent = [titulo.includes(cat) ? "" : cat, f.lugar, f.anio].filter(Boolean).join(" · ");
    $("#visor-contador").textContent = `Cuadro ${nro(visor.pos)} / ${dos(visor.lista.length)}`;
    $$(".cuadrito", $("#visor-tira")).forEach((c, k) => {
      const activo = k === visor.pos;
      c.setAttribute("aria-current", String(activo));
      if (activo && !presentacion.activa) c.scrollIntoView({ inline: "center", block: "nearest", behavior: quieto ? "auto" : "smooth" });
    });
    ponerRuta(`foto/${idFoto(f)}`);
    programarPaso();
  }

  function mover(delta) {
    if (!visor.lista.length) return;
    visor.pos = (visor.pos + delta + visor.lista.length) % visor.lista.length;
    mostrarEnVisor();
  }

  function abrirVisor(indice) {
    if (!visor.el) return;
    clearTimeout(visor.timer);
    visor.lista = indicesVisibles();
    visor.pos = Math.max(0, visor.lista.indexOf(indice));
    visor.foco = $$(".afiche__boton")[indice] || document.activeElement;
    visor.el.hidden = false;
    armarTira();
    mostrarEnVisor();
    requestAnimationFrame(() => visor.el.classList.add("abierto"));
    document.body.classList.add("sin-scroll");
    $("#visor-cerrar").focus({ preventScroll: true });
    disparar(0.3);
  }

  function cerrarVisor() {
    if (visor.el.hidden) return;
    detenerPresentacion();
    visor.el.classList.remove("abierto");
    document.body.classList.remove("sin-scroll");
    visor.timer = setTimeout(() => { visor.el.hidden = true; }, quieto ? 0 : 250);
    if (visor.foco) visor.foco.focus({ preventScroll: true });
    ponerRuta(estado.album ? `album/${estado.album.id}` : "");
  }

  /* ---------- Modo presentación: pasa las fotos solas a pantalla completa ---------- */
  const presentacion = { activa: false, timer: 0, pantallaCompleta: false };
  const PASO_MS = 4500;

  function iniciarPresentacion() {
    if (!visor.el) return;
    if (visor.el.hidden) {
      const lista = indicesVisibles();
      if (!lista.length) return;
      abrirVisor(lista[0]);
    }
    presentacion.activa = true;
    visor.el.classList.add("visor--presentacion");
    actualizarBotonPresentacion();
    if (visor.el.requestFullscreen && !document.fullscreenElement) {
      visor.el.requestFullscreen()
        .then(() => { presentacion.pantallaCompleta = true; })
        .catch(() => { /* sin pantalla completa igual funciona */ });
    }
    programarPaso();
    contar("presentacion");
  }

  function programarPaso() {
    clearTimeout(presentacion.timer);
    if (!presentacion.activa) return;
    const barra = $("#visor-progreso");
    barra.style.setProperty("--paso", `${PASO_MS}ms`);
    barra.classList.remove("corriendo");
    void barra.offsetWidth;
    barra.classList.add("corriendo");
    presentacion.timer = setTimeout(() => mover(1), PASO_MS);
  }

  function detenerPresentacion() {
    if (!presentacion.activa) return;
    presentacion.activa = false;
    clearTimeout(presentacion.timer);
    visor.el.classList.remove("visor--presentacion");
    $("#visor-progreso").classList.remove("corriendo");
    actualizarBotonPresentacion();
    if (presentacion.pantallaCompleta && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    presentacion.pantallaCompleta = false;
  }

  function actualizarBotonPresentacion() {
    const b = $("#visor-presentacion");
    if (!b) return;
    b.setAttribute("aria-pressed", String(presentacion.activa));
    b.innerHTML = presentacion.activa
      ? `<span aria-hidden="true">❚❚</span> Pausar`
      : `<span aria-hidden="true">▶</span> Pasar solas`;
  }

  /* ---------- Links directos: #foto/talleres-04 y #album/talleres-femenino ---------- */
  function leerRuta() {
    let ruta = "";
    try { ruta = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
    if (ruta.startsWith("foto/")) {
      const i = D.fotos.findIndex((f) => idFoto(f) === ruta.slice(5));
      if (i < 0) return;
      if (!visor.el.hidden && visor.lista[visor.pos] === i) return;
      abrirVisor(i);
    } else if (ruta.startsWith("album/")) {
      if (!visor.el.hidden) cerrarVisor();
      abrirAlbum(ruta.slice(6));
    }
  }

  /* ---------- Credencial de prensa ---------- */
  function armarCredencial() {
    const caja = $("#credencial-foto");
    if (caja && D.fotoPerfil) {
      const img = new Image();
      img.alt = `Retrato de ${D.nombre || "la fotógrafa"}`;
      img.addEventListener("load", () => caja.prepend(img), { once: true });
      img.src = D.fotoPerfil;
    }

    const barras = $("#barras");
    if (barras) {
      let x = 0;
      let rects = "";
      const anchos = [1, 1, 1, 2, 2, 3];
      while (x < 118) {
        const w = anchos[Math.floor(Math.random() * anchos.length)];
        if (Math.random() > 0.3) rects += `<rect x="${x}" y="0" width="${w}" height="30"/>`;
        x += w + 1;
      }
      barras.innerHTML = rects;
    }

    const colgante = $("#colgante");
    const seccion = $("#quien");
    if (!quieto && colgante && seccion && window.matchMedia("(hover: hover)").matches) {
      seccion.addEventListener("pointermove", (e) => {
        const r = colgante.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
        colgante.style.setProperty("--empuje", `${(dx * -14).toFixed(2)}deg`);
      });
      seccion.addEventListener("pointerleave", () => colgante.style.setProperty("--empuje", "0deg"));
    }
  }

  /* ---------- Contacto ---------- */
  function armarContacto() {
    const cont = $("#contacto");
    if (!cont) return;
    const c = D.contacto || {};
    const saludo = `¡Hola ${D.nombre || ""}! Vi tu portfolio y quiero consultarte por unas fotos.`;
    const usuarioIg = (c.instagram || "").replace(/^@/, "").trim();
    const wa = (c.whatsapp || "").trim();
    const linkWa = /^https?:\/\//.test(wa)
      ? wa
      : wa.replace(/\D/g, "") && `https://wa.me/${wa.replace(/\D/g, "")}?text=${encodeURIComponent(saludo)}`;
    const opciones = [
      { nombre: "WhatsApp", href: linkWa, detalle: "el más rápido" },
      { nombre: "Instagram", href: usuarioIg && `https://instagram.com/${encodeURIComponent(usuarioIg)}`, detalle: usuarioIg && `@${usuarioIg}` },
      { nombre: "Mail", href: c.email && `mailto:${c.email}?subject=${encodeURIComponent("Consulta por fotos")}`, detalle: c.email }
    ];
    if (c.portfolioAnterior) opciones.push({ nombre: "Más fotos", href: c.portfolioAnterior, detalle: "portfolio anterior" });

    // los datos vacíos no se muestran; si no hay ninguno, se esconde el bloque entero
    const conDato = opciones.filter((o) => o.href);
    if (!conDato.length) {
      cont.hidden = true;
      const titulo = $("#contacto-titulo");
      if (titulo) titulo.hidden = true;
      console.warn("Contacto: no hay Instagram ni mail cargados (se cargan desde el panel, en Datos del sitio)");
      return;
    }

    conDato.forEach((o) => {
      const el = document.createElement("a");
      el.className = "contacto__boton";
      el.href = o.href;
      if (!o.href.startsWith("mailto:")) {
        el.target = "_blank";
        el.rel = "noopener";
      }
      el.innerHTML = `<span>${esc(o.nombre)}</span><small>${esc(o.detalle || "")}</small>`;
      cont.append(el);
    });
  }

  /* ---------- Formulario "Armá tu fecha" ---------- */
  function armarPedido() {
    const form = $("#pedido");
    if (!form) return;
    const c = D.contacto || {};
    const numero = /^https?:\/\//.test(c.whatsapp || "") ? "" : (c.whatsapp || "").replace(/\D/g, "");
    const usuarioIg = (c.instagram || "").replace(/^@/, "").trim();
    const email = (c.email || "").trim();
    // el primer canal que esté cargado es por donde sale el pedido
    const canal = numero ? "whatsapp" : email ? "mail" : usuarioIg ? "instagram" : "";
    const aviso = $("#pedido-aviso");
    const boton = $("#pedido-enviar");
    const etiquetas = { whatsapp: "Mandar por WhatsApp", mail: "Mandar por mail", instagram: "Mandar por Instagram", "": "Mandar" };
    if (boton) boton.innerHTML = `${etiquetas[canal]} <span aria-hidden="true">→</span>`;
    const tipos = Array.isArray(D.tiposDePedido) && D.tiposDePedido.length
      ? D.tiposDePedido
      : D.categorias.map((cat) => cat.nombre);

    // opciones de "¿Qué necesitás?"
    const cont = $("#pedido-tipos");
    tipos.forEach((t, k) => {
      const id = `pedido-tipo-${k}`;
      const op = document.createElement("span");
      op.className = "pedido__opcion";
      op.innerHTML = `<input type="radio" name="tipo" id="${id}" value="${esc(t)}"><label for="${id}">${esc(t)}</label>`;
      cont.append(op);
    });

    // no se puede pedir una fecha que ya pasó
    const fecha = $("#pedido-fecha");
    if (fecha) {
      const hoy = new Date();
      fecha.min = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
    }

    // código de barras del talón
    const barras = $("#pedido-barras");
    if (barras) {
      let x = 0;
      let rects = "";
      while (x < 118) {
        const w = [1, 1, 2, 3][Math.floor(Math.random() * 4)];
        if (Math.random() > 0.3) rects += `<rect x="${x}" y="0" width="${w}" height="26"/>`;
        x += w + 1;
      }
      barras.innerHTML = rects;
    }

    const avisar = (texto, tipo = "error") => {
      aviso.textContent = texto;
      aviso.dataset.tipo = tipo;
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const datos = new FormData(form);
      const tipo = (datos.get("tipo") || "").trim();
      const nombre = (datos.get("nombre") || "").trim();
      const lugar = (datos.get("lugar") || "").trim();
      const idea = (datos.get("idea") || "").trim();
      const f = datos.get("fecha");

      if (!tipo) {
        avisar("Elegí qué necesitás.");
        $('input[name="tipo"]', form).focus();
        return;
      }
      if (!nombre) {
        avisar("Poné a nombre de quién va la fecha.");
        $("#pedido-nombre").focus();
        return;
      }

      contar(`pedido-${canal || "sin-contacto"}`);
      const fechaLinda = f ? f.split("-").reverse().join("/") : "a definir";
      const mensaje = [
        `¡Hola ${D.nombre || ""}! Te escribo desde tu portfolio.`,
        `Necesito: ${tipo}`,
        `Fecha: ${fechaLinda}`,
        lugar && `Lugar: ${lugar}`,
        idea && `La idea: ${idea}`,
        `Soy: ${nombre}`
      ].filter(Boolean).join("\n");

      const copiar = () => (navigator.clipboard ? navigator.clipboard.writeText(mensaje) : Promise.reject());

      if (canal === "whatsapp") {
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
        avisar("Listo, se abrió WhatsApp con tu mensaje. Solo falta darle enviar.", "ok");
        disparar(0.3);
        return;
      }
      if (canal === "mail") {
        window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Fecha: ${tipo}`)}&body=${encodeURIComponent(mensaje)}`;
        avisar("Se abrió tu correo con el mensaje armado. Solo falta darle enviar.", "ok");
        disparar(0.3);
        return;
      }
      if (canal === "instagram") {
        // Instagram no deja precargar el texto: lo copiamos y abrimos el chat para pegarlo
        const copiado = copiar();
        window.open(`https://ig.me/m/${encodeURIComponent(usuarioIg)}`, "_blank", "noopener");
        copiado
          .then(() => avisar("Copiamos tu mensaje y se abrió su Instagram: pegalo en el chat y mandalo.", "ok"))
          .catch(() => avisar(`Se abrió su Instagram (@${usuarioIg}). Contale ahí qué necesitás.`, "ok"));
        disparar(0.3);
        return;
      }
      // sin ningún canal cargado: copiamos el mensaje para que no se pierda
      console.warn("Armá tu fecha: no hay mail ni Instagram cargados (se cargan desde el panel, en Datos del sitio)");
      copiar()
        .then(() => avisar("Todavía no hay un contacto cargado. Copiamos tu mensaje para que se lo mandes por donde la conozcas."))
        .catch(() => avisar("Todavía no hay un contacto cargado. Probá de nuevo más tarde."));
    });

    form.addEventListener("change", () => {
      if (aviso.dataset.tipo === "error") avisar("", "");
    });
  }

  /* ---------- Pantalla gigante (videos de Adobe Portfolio) ---------- */
  function armarVideos() {
    const tira = $("#videos");
    const seccion = $("#pantalla");
    const lista = Array.isArray(D.videos) ? D.videos.filter((v) => v && v.id) : [];
    if (!tira || !seccion) return;
    if (!lista.length) {
      seccion.hidden = true;
      $$('.setlist a[href="#pantalla"]').forEach((a) => a.closest("li").remove());
      return;
    }
    lista.forEach((v, k) => {
      const item = document.createElement("div");
      item.className = `pantalla__video pantalla__video--${v.formato === "horizontal" ? "horizontal" : "vertical"}`;
      item.setAttribute("role", "listitem");
      const marco = document.createElement("iframe");
      marco.src = `https://www-ccv.adobe.io/v1/player/ccv/${encodeURIComponent(v.id)}/embed?bgcolor=%230b0b0d&lazyLoading=true&api_key=BehancePro2View`;
      marco.title = v.titulo || `Video ${dos(k + 1)}`;
      marco.loading = "lazy";
      marco.allow = "fullscreen; autoplay";
      marco.allowFullscreen = true;
      const rotulo = document.createElement("span");
      rotulo.className = "pantalla__rotulo";
      rotulo.textContent = `● REC ${dos(k + 1)}`;
      item.append(marco, rotulo);
      tira.append(item);
    });
  }

  /* ---------- Arranque ---------- */
  completarTextos();
  armarTablero();
  armarSetlist();
  armarPublico();
  armarEntradas();
  armarGrilla();
  armarVisor();
  armarCredencial();
  armarContacto();
  armarPedido();
  armarVideos();
  armarAlbumes();
  armarEstadisticas();
  $$(".revelar").forEach(observar);
  leerRuta();
  window.addEventListener("hashchange", leerRuta);
  if (visor.el && visor.el.hidden) disparar(0.85);
})();
