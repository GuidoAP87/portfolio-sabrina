# Portfolio de Sabrina

Sitio estático (HTML + CSS + JS, sin instalar nada) con un **panel de admin** en `/admin` para que Sabri suba fotos, arme carpetas y álbumes y cambie los textos sin tocar código.

- **Sitio:** https://guidoap87.github.io/portfolio-sabrina/
- **Panel:** https://guidoap87.github.io/portfolio-sabrina/admin/
- **Repositorio:** https://github.com/GuidoAP87/portfolio-sabrina

## Cómo está ordenado

```
index.html            el sitio
css/  js/             estilos e interacciones (js/datos.js carga el contenido y después js/app.js)
datos/sitio.json      TODO el contenido: textos, carpetas, álbumes, fotos y videos (lo escribe el panel)
fotos/<carpeta>/      las fotos grandes (hasta 2000 px)
fotos/<carpeta>/mini/ las miniaturas de la pared (640 px)
admin/                el panel (config.js dice a qué repositorio de GitHub guarda)
herramientas/         panel en modo local y otras ayudas
.github/workflows/    publica el sitio en GitHub Pages cada vez que se guarda algo
```

## El panel (`/admin`)

Se entra a https://guidoap87.github.io/portfolio-sabrina/admin/ desde la compu o el celu, con una **clave de acceso** (un token de GitHub, ver abajo). La clave queda guardada en ese navegador.

- **Carpetas**: cada una es una "entrada" del sitio para filtrar fotos (Escenarios, Talleres, Moda…). Se crean con "+ Nueva carpeta", se renombran, se ordenan con ↑ ↓ y se borran cuando están vacías. Las carpetas vacías no se ven en el sitio.
- **Fotos**: "Subir fotos" (o arrastrarlas) las achica solas antes de subir (2000 px la grande, 640 px la miniatura) y las deja primeras en la carpeta. Tocando una foto se le pone título, lugar y año, se la cambia de carpeta o de álbum, se la ordena y se la borra. Con el tilde se eligen varias para moverlas, ponerlas en un álbum o borrarlas juntas. En la compu, el orden también se cambia arrastrando.
- **Álbumes**: van dentro de una carpeta (por ejemplo, un partido o un recital), tienen su propio link (`…/#album/<nombre>`) y se ven como sobres de revelado. Se elige la foto de tapa desde el editor de la foto.
- **Datos del sitio**: foto de la credencial, nombre, ciudad, frase de portada, "Quién saca las fotos", Instagram, mail y firma de las fotos.

Todo se **guarda solo** (arriba dice "Guardado"). Cada guardado queda en el historial de GitHub y el sitio se actualiza en 1 o 2 minutos.

En "Todas", la pared mezcla las carpetas: una foto de cada una por turno, en el orden de cada carpeta. Así siempre queda variada sin ordenar nada a mano.

### La clave de acceso (token de GitHub)
La crea quien es dueño del repositorio, una sola vez:
1. Entrar a https://github.com/settings/personal-access-tokens/new
2. Nombre: "Panel de Sabri". Duración: la que quieran (cuando vence, se crea otra igual).
3. *Repository access* → *Only select repositories* → elegir el repositorio del sitio.
4. *Permissions* → *Contents* → **Read and write**.
5. *Generate token*, copiarla y pasársela a Sabri por un medio privado. Ella la pega en el panel una vez por dispositivo.

Si se pierde o se filtra, se borra desde la misma página de GitHub y se crea otra.

### Panel en modo local (sin internet)
```
python herramientas/panel_local.py
```
y entrar a http://localhost:5519/admin/. Guarda directo en esta carpeta, sin clave. Sirve para probar o para ordenar sin conexión; después hay que subir los cambios a GitHub.

## Publicación (GitHub Pages)
Ya está publicado: el repositorio es público (así Pages es gratis), Pages publica con GitHub Actions (`.github/workflows/publicar.yml`) en cada cambio y `admin/config.js` apunta a GuidoAP87/portfolio-sabrina.

- **Si se edita algo a mano en la compu**, antes hacer `git pull`: el panel guarda directo en GitHub y la carpeta local queda atrasada.
- **Si algún día tiene dominio propio** (por ejemplo sabrinabaroni.com.ar): configurarlo en *Settings → Pages → Custom domain* y cambiar la dirección en `og:url`, `og:image` y `twitter:image` de `index.html` (WhatsApp necesita la dirección completa para mostrar la vista previa).

## Funciones del sitio

### Link propio y compartir
Cada foto tiene su link: `…/#foto/talleres-04` abre directo esa foto en grande (carpeta + número). En el visor, **Compartir** abre el menú de compartir del celular; en la compu copia el link. La vista previa de esos links es la general (`og-imagen.jpg`): WhatsApp e Instagram no leen la parte del `#`. Si una foto se mueve de carpeta, cambia su link.

### Modo presentación
"Ver en presentación" (en la pared) o "Pasar solas" (en el visor) pasa las fotos solas cada 4,5 segundos, a pantalla completa cuando el navegador lo permite.

### Firma
Aparece en una esquina de cada foto abierta en grande. Se cambia desde el panel, en Datos del sitio; vacía no se muestra. Los archivos de las fotos no se modifican.

### Contacto y formulario "Armá tu fecha"
**Por ahora no se publica número de WhatsApp.** El formulario arma el pedido y lo manda por mail o, si no hay mail, por Instagram (copia el mensaje y abre el chat, porque Instagram no deja precargar texto). **Antes de difundir el sitio, cargá el mail o el Instagram** desde el panel. Las opciones de "¿Qué necesitás?" están en `tiposDePedido` dentro de `datos/sitio.json`.

### Contador de visitas
1. Crear una cuenta gratis en goatcounter.com y elegir un código, por ejemplo `sabrinabaroni`.
2. Ponerlo en `estadisticas.goatcounter` dentro de `datos/sitio.json`.
Cuenta visitas, fotos y álbumes compartidos, pedidos y usos de la presentación. En la compu no cuenta.

### Videos
Están en `videos` dentro de `datos/sitio.json`: son los 12 que tiene subidos en Adobe Portfolio ("Pantalla gigante"). Si deja Adobe, hay que reemplazarlos.

## Cómo verlo en la compu
Desde esta carpeta:
```
python -m http.server 5517
```
y entrar a http://localhost:5517 (con doble clic en `index.html` no carga, porque el contenido se lee de `datos/sitio.json`).

## Detalles escondidos
- **Tablero LED**: el 12/10 saluda al Matador por su cumple y el 17/10 dice "Feliz Día de la Lealtad".
- La credencial es la N° 1913, el año en que se fundó Talleres.
- Si la persona tiene activado "reducir movimiento" en su sistema, se apagan las animaciones y el flash.
