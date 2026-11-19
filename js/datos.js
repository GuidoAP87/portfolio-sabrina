/* =========================================================
   Carga el contenido del sitio desde datos/sitio.json
   (ese archivo lo escribe el panel de admin: /admin)
   y lo deja listo para app.js.
   ========================================================= */
(() => {
  "use strict";

  const idFoto = (f) => (f.archivo || "").replace(/^fotos\//, "").replace(/\.[a-z]+$/i, "").replace(/\//g, "-");

  function formato(f) {
    if (!f.ancho || !f.alto) return "vertical";
    const r = f.ancho / f.alto;
    if (r > 1.8) return "panoramica";
    if (r > 1.1) return "horizontal";
    if (r > 0.9) return "cuadrada";
    return "vertical";
  }

  function normalizar(d) {
    d = d && typeof d === "object" ? d : {};
    const carpetas = Array.isArray(d.carpetas) ? d.carpetas.filter((c) => c && c.id) : [];
    const albumes = Array.isArray(d.albumes) ? d.albumes.filter((a) => a && a.id) : [];
    const fotos = Array.isArray(d.fotos) ? d.fotos.filter((f) => f && f.archivo) : [];
    const nombreCarpeta = (id) => (carpetas.find((c) => c.id === id) || {}).nombre || "";
    const tituloAlbum = (id) => (albumes.find((a) => a.id === id) || {}).titulo || "";

    // las fotos de cada carpeta, en el orden que eligió Sabri en el panel
    const grupos = carpetas.map((c) => fotos.filter((f) => f.carpeta === c.id));

    // "Todas": una foto de cada carpeta por turno, así la pared queda variada
    const todas = [];
    for (let k = 0; grupos.some((g) => k < g.length); k++) {
      grupos.forEach((g) => { if (k < g.length) todas.push(g[k]); });
    }

    return {
      ...d,
      categorias: carpetas
        .filter((c, k) => grupos[k].length)
        .map((c) => ({ id: c.id, nombre: c.nombre, sector: c.sector })),
      fotos: todas.map((f) => ({
        ...f,
        categoria: f.carpeta,
        titulo: f.titulo || tituloAlbum(f.album) || nombreCarpeta(f.carpeta),
        ar: f.ancho && f.alto ? f.ancho / f.alto : 0,
        formato: formato(f)
      })),
      albumes: albumes
        .map((a) => ({ ...a, fotos: grupos.flat().filter((f) => f.album === a.id).map(idFoto) }))
        .filter((a) => a.fotos.length)
    };
  }

  function arrancar(datos) {
    window.SABRINA = normalizar(datos);
    const s = document.createElement("script");
    s.src = "js/app.js";
    document.body.append(s);
  }

  // el número cambia cada minuto: así lo que se sube desde el panel aparece sin esperar la caché
  const version = Math.floor(Date.now() / 60000);
  fetch(`datos/sitio.json?v=${version}`, { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(arrancar)
    .catch((e) => {
      console.error("No se pudo cargar datos/sitio.json:", e);
      arrancar({});
      const grilla = document.getElementById("grilla");
      if (grilla) {
        grilla.innerHTML =
          '<p class="sin-datos">No se pudieron cargar las fotos. Probá recargar la página.</p>';
      }
    });
})();
