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
