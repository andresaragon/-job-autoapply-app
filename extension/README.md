# 🧩 JobAutoApply Assistant — Extensión de Chrome (Manifest V3)

Extensión de navegador para Google Chrome y Microsoft Edge diseñada para **autollenar en 1-clic** los formularios de postulación en portales de empleo (**Greenhouse**, **Lever**, **Ashby**, **Workday** y portales web genéricos), respetando el ciclo de eventos reactivos (`input`, `change`, `blur`) y validaciones de campo.

---

## ⚡ Características Principales

1. **Detección Automática de ATS:**
   - Detecta si la pestaña activa pertenece a *Greenhouse*, *Lever*, *Ashby*, *Workday* o un formulario web genérico.
   - Muestra una insignia de estado visual en la cabecera del popup.
2. **Autollenado Inteligente en 1-Clic:**
   - Completa automáticamente: Nombre, Apellidos, Nombre Completo, Email, Teléfono, LinkedIn, GitHub, Portafolio, Ubicación y Carta de Presentación.
   - Dispara los setters nativos de HTML5 para que frameworks reactivos (React, Vue, Angular) reconozcan la mutación de estado.
   - Resalta los campos completados con un borde verde esmeralda y muestra un *toast* flotante no intrusivo en la página informando cuántos campos se rellenaron.
3. **Autonomía 100% On-Device:**
   - Funciona sin necesidad de tener un servidor activo: los datos del candidato se almacenan de forma segura y privada en `chrome.storage.local`.
   - Permite editar los datos directamente desde el popup.
4. **Sincronización Bidireccional con JobAutoApply Web:**
   - Botón directo para sincronizar tu perfil persistente desde `http://localhost:3000/api/profile` con un solo clic.

5. **Respuestas del tracker (v1.1):**
   - Se conecta a `empleo.vacantes` (tracker del pipeline diario) a través de la Edge Function `empleo-autofill`.
   - Detecta qué vacante corresponde a la pestaña abierta (URL, id del ATS o empresa) o te deja elegirla.
   - Rellena las preguntas del formulario con `respuestas_sugeridas` y la carta, emparejando cada etiqueta por intención (autorización EE.UU., visa, ubicación, años de Python/SQL, salario…) o por similitud de palabras.
   - Selects y radios de sí/no: elige la opción según la respuesta ("No. I'm based in Colombia…" → **No**).
   - **Naranja = revisar a mano:** datos pendientes (`[COMPLETAR]`), respuestas más largas que el límite del campo (nunca se recortan) y preguntas obligatorias sin respuesta.
   - Botón **"Ya la envié: marcar como postulada"**: solo cambia `propuesta → postulada` y pone seguimiento a 7 días.
   - **Nunca envía el formulario ni sube archivos.** El clic en *Enviar* y el CV (EN/ES según `cv_sugerido`) son tuyos.

---

## 🔌 Conectar con el tracker (una sola vez)

1. Desplegar la función (desde la raíz del repo, con el CLI de Supabase enlazado al proyecto del tracker):
   ```bash
   supabase secrets set AUTOFILL_TOKEN=$(openssl rand -hex 24)
   supabase functions deploy empleo-autofill --no-verify-jwt
   ```
2. En el popup → **Conexión con el tracker**: pega la URL `https://<proyecto>.supabase.co/functions/v1/empleo-autofill` y el mismo token. Guardar.
3. Recarga la extensión en `chrome://extensions` después de actualizar el código.

## 🧪 Tests

```bash
npm run test:extension
```
```bash
npm run test:extension:e2e   # primera vez: npx playwright install chromium
```
Abre Chromium con la extensión real sobre `test/fixtures/greenhouse-like.html` y comprueba qué queda en verde y qué en naranja (radios obligatorios, salario del perfil, campos que el portal vacía como la ubicación de Lever). No necesita red ni token.

Cubre el parser de respuestas, el emparejamiento de preguntas (incluido que nunca conteste "autorizado en EE.UU." con la respuesta de ubicación) y la detección de la vacante por URL. `test/fixtures/greenhouse-like.html` sirve para probar el content script en un navegador.

---

## 🚀 Cómo instalar la extensión en Chrome o Edge

### Paso 1: Abrir la página de extensiones
- En **Google Chrome**: abre una nueva pestaña y escribe `chrome://extensions/`
- En **Microsoft Edge**: escribe `edge://extensions/`
- O ve a Menú (tres puntos) > **Extensiones** > **Administrar extensiones**.

### Paso 2: Activar el Modo Desarrollador
- En la esquina superior derecha, activa el interruptor **Modo de desarrollador** (Developer mode).

### Paso 3: Cargar la extensión descomprimida
1. Haz clic en el botón **Cargar descomprimida** (Load unpacked) en la esquina superior izquierda.
2. Selecciona la carpeta:
   ```
   D:\Workspace\job-autoapply-app\extension
   ```
3. ¡Listo! Verás la tarjeta de **JobAutoApply Assistant — Auto-Fill ATS** instalada y lista para usarse.
4. Fíjala en la barra de herramientas haciendo clic en el ícono de la pieza de rompecabezas 🧩 y luego en el pin 📌 junto a JobAutoApply.

---

## 🧪 Cómo probar el autollenado

1. Abre cualquier oferta de empleo real o formulario de prueba en Greenhouse, Lever o Ashby. Por ejemplo:
   - Ofertas en Greenhouse: `https://boards.greenhouse.io/...`
   - Ofertas en Lever: `https://jobs.lever.co/...`
   - Ofertas en Ashby: `https://jobs.ashbyhq.com/...`
2. Haz clic en el ícono de **JobAutoApply Assistant** en tu barra de herramientas.
3. El popup detectará automáticamente el tipo de portal.
4. Haz clic en el botón principal **⚡ Auto-Fill en 1-Clic**.
5. Observa cómo todos los campos se completan instantáneamente con bordes verdes y aparece el aviso flotante.
6. Revisa los datos y pulsa *Enviar* o adjunta tu PDF generado con el exportador ATS.
