"""Panel en modo local.

Sirve el sitio y el panel (/admin) en esta compu y simula la parte de GitHub que
usa el panel: los cambios (fotos, carpetas, textos) se guardan directamente en
la carpeta del sitio, sin internet ni clave. Sirve para probar el panel o para
ordenar fotos sin conexión; después hay que subir la carpeta a GitHub.

Uso (desde la carpeta portfolio-sabrina):
    python herramientas/panel_local.py
    → abrir http://localhost:5519/admin/

Opciones:
    --puerto 5519           puerto donde escucha
    --carpeta RUTA          carpeta del sitio (por defecto, la de este proyecto)
"""
import argparse
import base64
import hashlib
import json
import os
import re
import secrets
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

RAMA = "main"


def sha_git(datos):
    return hashlib.sha1(b"blob %d\0" % len(datos) + datos).hexdigest()


class Repo:
    """Un repositorio de mentira: el 'último commit' es lo que hay en la carpeta."""

    def __init__(self, raiz):
        self.raiz = os.path.abspath(raiz)
        self.lock = threading.Lock()
        self.blobs = {}
        self.arboles = {}
        self.commits = {}
        self.cabeza = secrets.token_hex(20)
        self.commits[self.cabeza] = {"arbol": secrets.token_hex(20), "padre": None, "mensaje": "inicio"}

    def ruta(self, rel):
        rel = rel.replace("\\", "/")
        partes = rel.split("/")
        if not rel or rel.startswith("/") or ".." in partes or ":" in rel:
            raise ValueError("ruta inválida: " + rel)
        return os.path.join(self.raiz, *partes)

    def archivos(self):
        for base, dirs, files in os.walk(self.raiz):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
            for f in files:
                if not f.startswith("."):
                    yield os.path.relpath(os.path.join(base, f), self.raiz).replace(os.sep, "/")

    def leer(self, rel):
        with open(self.ruta(rel), "rb") as fh:
            return fh.read()

    def mapa(self):
        return {rel: sha_git(self.leer(rel)) for rel in self.archivos()}

    def contenido(self, sha):
        if sha in self.blobs:
            return self.blobs[sha]
        for rel, s in self.mapa().items():
            if s == sha:
                return self.leer(rel)
        return None

    def aplicar(self, arbol):
        cambios = self.arboles[arbol]
        escribir = []
        for c in cambios:
            if c.get("sha"):
                datos = self.contenido(c["sha"])
                if datos is None:
                    raise KeyError("no encuentro el contenido " + c["sha"])
                escribir.append((c["path"], datos))
        for c in cambios:
            if not c.get("sha"):
                p = self.ruta(c["path"])
                if os.path.exists(p):
                    os.remove(p)
                    self.limpiar(os.path.dirname(p))
        for rel, datos in escribir:
            p = self.ruta(rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "wb") as fh:
                fh.write(datos)

    def limpiar(self, carpeta):
        # saca las carpetas que quedaron vacías (por ejemplo fotos/vieja/mini)
        while os.path.abspath(carpeta) != self.raiz and os.path.isdir(carpeta) and not os.listdir(carpeta):
            os.rmdir(carpeta)
            carpeta = os.path.dirname(carpeta)


def crear_manejador(repo):
    class Manejador(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=repo.raiz, **k)

        def log_message(self, formato, *args):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def responder(self, codigo, cuerpo):
            datos = json.dumps(cuerpo).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)

        def cuerpo(self):
            largo = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(largo) or b"{}")

        def do_GET(self):
            url = urlparse(self.path)
            if url.path == "/admin/config.js":
                datos = (
                    "window.PANEL = { owner: 'local', repo: 'sitio', rama: '%s', api: '/api', sitio: '../', local: true };\n" % RAMA
                ).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(datos)))
                self.end_headers()
                self.wfile.write(datos)
                return
            if url.path.startswith("/api/"):
                return self.api("GET", url)
            return super().do_GET()

        def do_POST(self):
            return self.api("POST", urlparse(self.path))

        def do_PATCH(self):
            return self.api("PATCH", urlparse(self.path))

        def api(self, metodo, url):
            m = re.match(r"^/api/repos/[^/]+/[^/]+(/.*)?$", url.path)
            if not m:
                return self.responder(404, {"message": "Not Found"})
            resto = unquote(m.group(1) or "")
            try:
                with repo.lock:
                    return self.ruta_api(metodo, resto)
            except ValueError as e:
                return self.responder(422, {"message": str(e)})
            except KeyError as e:
                return self.responder(404, {"message": str(e)})

        def ruta_api(self, metodo, resto):
            if metodo == "GET" and resto == "":
                return self.responder(200, {"full_name": "local/sitio", "default_branch": RAMA, "permissions": {"push": True}})
            if metodo == "GET" and resto == "/git/ref/heads/" + RAMA:
                return self.responder(200, {"ref": "refs/heads/" + RAMA, "object": {"sha": repo.cabeza, "type": "commit"}})
            m = re.match(r"^/git/commits/([0-9a-f]+)$", resto)
            if metodo == "GET" and m:
                c = repo.commits.get(m.group(1))
                if not c:
                    return self.responder(404, {"message": "Not Found"})
                return self.responder(200, {"sha": m.group(1), "tree": {"sha": c["arbol"]}})
            m = re.match(r"^/git/trees/([0-9a-f]+)$", resto)
            if metodo == "GET" and m:
                arbol = [{"path": r, "mode": "100644", "type": "blob", "sha": s} for r, s in sorted(repo.mapa().items())]
                return self.responder(200, {"sha": m.group(1), "tree": arbol, "truncated": False})
            m = re.match(r"^/git/blobs/([0-9a-f]+)$", resto)
            if metodo == "GET" and m:
                datos = repo.contenido(m.group(1))
                if datos is None:
                    return self.responder(404, {"message": "Not Found"})
                return self.responder(200, {"sha": m.group(1), "encoding": "base64", "content": base64.b64encode(datos).decode()})
            if metodo == "POST" and resto == "/git/blobs":
                b = self.cuerpo()
                datos = base64.b64decode(b["content"]) if b.get("encoding") == "base64" else b["content"].encode("utf-8")
                sha = sha_git(datos)
                repo.blobs[sha] = datos
                return self.responder(201, {"sha": sha})
            if metodo == "POST" and resto == "/git/trees":
                b = self.cuerpo()
                for e in b.get("tree", []):
                    repo.ruta(e["path"])  # valida la ruta
                sha = secrets.token_hex(20)
                repo.arboles[sha] = b.get("tree", [])
                return self.responder(201, {"sha": sha})
            if metodo == "POST" and resto == "/git/commits":
                b = self.cuerpo()
                sha = secrets.token_hex(20)
                padres = b.get("parents") or [None]
                repo.commits[sha] = {"arbol": b["tree"], "padre": padres[0], "mensaje": b.get("message", "")}
                return self.responder(201, {"sha": sha, "tree": {"sha": b["tree"]}})
            if metodo == "PATCH" and resto == "/git/refs/heads/" + RAMA:
                b = self.cuerpo()
                c = repo.commits.get(b.get("sha"))
                if not c:
                    return self.responder(422, {"message": "Object does not exist"})
                if c["padre"] != repo.cabeza and not b.get("force"):
                    return self.responder(422, {"message": "Update is not a fast forward"})
                repo.aplicar(c["arbol"])
                repo.cabeza = b["sha"]
                repo.blobs.clear()
                print("  guardado:", c["mensaje"], flush=True)
                return self.responder(200, {"ref": "refs/heads/" + RAMA, "object": {"sha": repo.cabeza}})
            return self.responder(404, {"message": "Not Found"})

    return Manejador


def main():
    aqui = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser(description="Panel de Sabri en modo local")
    p.add_argument("--puerto", type=int, default=5519)
    p.add_argument("--carpeta", default=os.path.join(aqui, ".."))
    args = p.parse_args()
    repo = Repo(args.carpeta)
    if not os.path.exists(os.path.join(repo.raiz, "datos", "sitio.json")):
        raise SystemExit("No encuentro datos/sitio.json en " + repo.raiz)
    servidor = ThreadingHTTPServer(("127.0.0.1", args.puerto), crear_manejador(repo))
    print("Panel local: http://localhost:%d/admin/   (sitio: http://localhost:%d/)" % (args.puerto, args.puerto), flush=True)
    print("Carpeta:", repo.raiz, flush=True)
    print("Para cortar: Ctrl+C", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
