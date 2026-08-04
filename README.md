# Modo Brígido

PWA móvil para registrar peso, cintura, calorías, proteína, pasos, sueño y entrenamientos Push–Pull–Legs. Usa **GitHub Pages** para publicar la interfaz y **Supabase** para cuentas, memoria y sincronización.

## Qué incluye

- Registro e inicio de sesión para múltiples usuarios.
- Privacidad por usuario mediante Row Level Security.
- Check-in diario con peso, cintura, sueño, energía, hambre y cannabis opcional.
- Calorías, proteína y pasos.
- Rutinas Push A, Pull A, Legs A, Push B, Pull B y Legs B.
- Series, kilos, repeticiones y RIR.
- Sustitución de ejercicios solo por hoy o permanente.
- Gráficos de peso y cintura, adherencia, puntos y logros básicos.
- Exportación e importación de respaldo JSON.
- Instalación como PWA y funcionamiento básico offline de la interfaz.
- Despliegue automático en GitHub Pages con GitHub Actions.

---

# Instalación sin programar

## Paso 1 — Subir los archivos a GitHub

1. Descomprime el ZIP.
2. Entra al repositorio que creaste en GitHub.
3. Pulsa **Add file → Upload files**.
4. Arrastra **todo el contenido interior** de la carpeta `modo-brigido`, no la carpeta exterior.
5. Escribe `Primera versión de Modo Brígido` y pulsa **Commit changes**.

GitHub no permite subir una carpeta vacía, pero todas las carpetas de este proyecto contienen archivos.

## Paso 2 — Crear el proyecto en Supabase

1. Entra a `https://supabase.com/dashboard`.
2. Pulsa **New project**.
3. Elige un nombre como `modo-brigido`.
4. Crea una contraseña fuerte para la base de datos y guárdala.
5. Selecciona una región cercana a Chile si está disponible.
6. Espera a que termine la creación.

## Paso 3 — Crear las tablas y la seguridad

1. Dentro del proyecto Supabase, abre **SQL Editor**.
2. Pulsa **New query**.
3. En este repositorio abre el archivo `supabase/schema.sql`.
4. Copia todo su contenido y pégalo en SQL Editor.
5. Pulsa **Run**.
6. Debe aparecer un mensaje de éxito.

Este script crea las tablas, ejercicios iniciales, rutinas PPL, perfiles y reglas que impiden que un usuario vea los datos de otro.

## Paso 4 — Obtener las dos claves públicas

En Supabase:

1. Pulsa **Connect** en la parte superior del proyecto, o ve a **Project Settings → API**.
2. Copia:
   - **Project URL**: se ve como `https://xxxxx.supabase.co`
   - **Publishable key**: normalmente empieza con `sb_publishable_`

Nunca uses en la web una clave `secret` o `service_role`.

## Paso 5 — Elegir cómo conectar la app

### Opción A: la más fácil

Publica la web primero. Al abrirla aparecerá una pantalla para pegar la Project URL y la Publishable key. Se guardan en ese navegador.

Tu esposa tendrá que pegar las mismas dos claves una vez en su teléfono. Después cada uno crea su propia cuenta.

### Opción B: dejarla configurada para todos

Antes de subir o directamente desde GitHub, edita:

```text
public/app-config.js
```

Y reemplaza los valores vacíos:

```js
window.MODO_BRIGIDO_CONFIG = {
  supabaseUrl: 'https://xxxxx.supabase.co',
  supabasePublishableKey: 'sb_publishable_...'
};
```

La publishable key puede estar en una aplicación web. La seguridad real la aplican las políticas RLS del archivo SQL.

## Paso 6 — Activar GitHub Pages

1. En el repositorio abre **Settings**.
2. En el menú izquierdo entra a **Pages**.
3. En **Build and deployment → Source**, selecciona **GitHub Actions**.
4. Abre la pestaña **Actions** del repositorio.
5. Espera que el flujo **Deploy GitHub Pages** quede verde.
6. Regresa a **Settings → Pages** para ver la URL publicada.

Después copia esa URL y agrégala en Supabase: **Authentication → URL Configuration → Site URL**. También agrégala en **Redirect URLs**. Esto permite que los enlaces de confirmación de correo vuelvan correctamente a la app.

La dirección será parecida a:

```text
https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/
```

El proyecto usa rutas con `#`, por lo que funciona aunque el nombre del repositorio sea distinto de `modo-brigido`.

## Paso 7 — Crear las cuentas

1. Abre la web.
2. Pulsa **No tengo cuenta todavía**.
3. Crea tu cuenta con correo y contraseña.
4. Tu esposa hace lo mismo con su propio correo.
5. Si Supabase exige confirmación, cada uno debe abrir el enlace recibido por correo.

Cada cuenta recibe automáticamente sus propias seis rutinas.

---

# Cómo funciona el cambio de ejercicio

Dentro de una sesión:

- **Solo hoy** cambia el ejercicio únicamente en el entrenamiento actual.
- **Permanente** cambia el ejercicio de la plantilla para las próximas veces.

Los historiales se guardan por ejercicio. Por ejemplo, el peso del remo sentado no se mezcla con el remo con mancuerna.

# Cómo sabe qué día es

Cada perfil guarda una zona horaria. Por defecto usa `America/Santiago`. La fecha diaria se calcula en esa zona y se almacena como `YYYY-MM-DD`.

# Desarrollo local opcional

Necesitas Node.js 22 o posterior.

```bash
npm install
npm run dev
```

Para verificar una versión de producción:

```bash
npm run build
npm run preview
```

# Archivos importantes

- `public/app-config.js`: configuración pública de Supabase.
- `supabase/schema.sql`: base de datos, rutinas y seguridad.
- `.github/workflows/deploy.yml`: publicación automática.
- `src/pages/WorkoutSessionPage.tsx`: registro y sustitución de ejercicios.
- `src/pages/TodayPage.tsx`: check-in diario.

# Respaldo

En **Más → Respaldo e importación** puedes descargar un JSON. Guárdalo periódicamente. El plan gratuito de Supabase no incluye los mismos respaldos automáticos descargables que los planes pagados.
