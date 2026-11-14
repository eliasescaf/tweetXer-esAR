# TweetXer (Fork en Español + Reintentos)

Fork en español de [tweetXer](https://github.com/lucahammer/tweetXer/) para eliminar tus tweets de forma gratuita desde la consola del navegador o mediante Tampermonkey.

## Cambios en este fork

* **Interfaz y logs 100% en español:** Todos los mensajes de estado, progreso y errores en consola están traducidos.
* **Sistema de reintentos y backoff ante límites (429) o errores de red:** A diferencia de la versión original que puede frenarse o perder el hilo ante un bloqueo temporal de la API interna de X, este fork incorpora un ciclo de tolerancia a fallos (`sendRequestWithRetry`):
  * **3 intentos por petición:** Ante un error `429` (Rate Limit), timeout (15s) o fallo de red, realiza hasta **2 reintentos** escalonados (esperando ~10s y ~30s con *jitter* aleatorio para evitar patrones robóticos).
  * **Pausa larga automática (15 minutos):** Si se agotan los 3 intentos (porque se llenó la ventana de peticiones), el script no aborta; entra en una pausa de **15 minutos** (900 segundos) con cuenta regresiva en pantalla y luego retoma automáticamente. Esto permite aprovechar cada reinicio de ventana de X para meter tandas adicionales (~200 borrados extra por ciclo) sin intervención manual.
  * **Lectura de cabeceras `x-rate-limit-remaining`:** Si la API avisa que queda 0 cuota disponible, espera exactamente hasta el timestamp `x-rate-limit-reset` antes de mandar la siguiente petición.

---

## Cómo usarlo

### 1. Descargá tus datos de X / Twitter
1. Entrá a **Configuración y privacidad** → **Tu cuenta** → **Descarga un archivo con tus datos**.
2. Confirmá tu contraseña y solicitá el archivo (X suele tardar unas 24 horas en habilitar la descarga).
3. Descomprimí el `.zip` descargado. Dentro de la carpeta `data/` vas a encontrar el archivo que necesita la herramienta: **`tweets.js`** (también es compatible con `tweet-headers.js`, que es una versión más liviana solo con IDs y fechas; alcanza con cargar uno solo).

### 2. Ejecutá el script en tu navegador
1. Iniciá sesión en [x.com](https://x.com) desde tu computadora.
2. Abrí las herramientas de desarrollador (**DevTools**) presionando `F12` o `Ctrl + Shift + I` (en Mac: `Cmd + Option + I`).
3. Entrá a la pestaña **Consola (Console)**.
   * *Nota:* Si es la primera vez que pegás código, Chrome/Firefox te van a pedir que escribas `allow pasting` (o `permitir pegar`) y presiones `Enter` por seguridad.
4. Copiá todo el contenido del archivo `tweetXer.js`, pegalo en la consola y presioná `Enter`.
5. Va a aparecer una barra celeste en la parte superior de la página. Hacé clic en **Seleccionar archivo** y cargá tu archivo `tweets.js` (o el archivo filtrado).

*(Alternativamente, podés instalar la extensión **Tampermonkey** y agregar el código como un nuevo Userscript).*

### 3. Opciones avanzadas y consejos
* **Saltear tweets (`skipCount`):** Si frenaste el proceso y lo retomás otro día, podés indicar cuántos tweets ya borraste para que no intente procesarlos de nuevo.
* **Borrado lento (sin archivo):** Disponible en *Opciones avanzadas*. Borra directamente desde el DOM de tu perfil sin necesitar el `.zip` de datos, aunque es más lento y menos confiable.
* **Cuidado de la cuenta:** Para evitar que X te pida resolver un captcha de verificación por actividad automatizada, se recomienda borrar en bloques de **2.000 a 3.000 tweets por día** en lugar de dejarlo corriendo 24 horas seguidas.

---

## Filtrar tweets por fecha antes de borrar (Opcional)

Si no querés borrar toda tu cuenta y preferís eliminar únicamente tweets antiguos (por ejemplo, anteriores al **1 de enero de 2025**), podés preprocesar el archivo `tweets.js` antes de cargarlo en TweetXer. El ejemplo está planteado para esa fecha, pero podés modificarla libremente.

### Pasos (en Linux)

1. **Ubicá el archivo**
   Dentro de la carpeta descomprimida de tu backup de X/Twitter, ubicá:
   ```text
   data/tweets.js
   ```
   *(A veces se llama `tweet.js` o viene dividido en `tweets-part0.js`, `tweets-part1.js`, etc.)*

2. **Creá el script de filtrado**
   Abrí una terminal en la carpeta donde está el archivo y creá el script:
   ```bash
   nano filtrar_tweets.py
   ```
   Pegá el siguiente código:
   ```python
   #!/usr/bin/env python3
   import json
   from datetime import datetime
   from pathlib import Path

   # === CONFIGURACIÓN ===
   INPUT_FILE = "tweets.js"              # Cambiá si se llama diferente
   OUTPUT_FILE = "tweets_antes_2025.js"  # Cambiá si se llama diferente
   CUTOFF = datetime(2025, 1, 1)         # Formato (AAAA, M, D) sin ceros a la izquierda. Borra tweets anteriores a esta fecha.

   def parse_twitter_date(date_str):
       # Formato típico: "Tue May 05 09:23:11 +0000 2024"
       return datetime.strptime(date_str, "%a %b %d %H:%M:%S %z %Y").replace(tzinfo=None)

   def main():
       path = Path(INPUT_FILE)
       if not path.exists():
           print(f"No encontré {INPUT_FILE}")
           return

       text = path.read_text(encoding="utf-8")

       # Buscamos el comienzo del array JSON
       start = text.find("[")
       if start == -1:
           print("No se encontró el array de tweets")
           return

       # Cargamos solo la parte JSON
       data = json.loads(text[start:])

       filtered = []
       for item in data:
           tweet = item.get("tweet", item)  # a veces viene directo
           created = tweet.get("created_at")
           if not created:
               continue
           try:
               dt = parse_twitter_date(created)
               if dt < CUTOFF:
                   filtered.append(item)
           except Exception as e:
               print(f"Error con fecha {created}: {e}")

       # Guardamos en el mismo formato que espera tweetXer
       with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
           f.write("window.YTD.tweets.part0 = ")
           json.dump(filtered, f, ensure_ascii=False, indent=2)

       print(f"Listo. Original: {len(data)} tweets")
       print(f"Filtrados: {len(filtered)} tweets")
       print(f"Archivo generado: {OUTPUT_FILE}")

   if __name__ == "__main__":
       main()
   ```

3. **Ejecutá el script**
   ```bash
   python3 filtrar_tweets.py
   ```

4. **Usá el archivo filtrado**
   Abrí X en tu navegador, ejecutá `tweetXer.js` en la consola y seleccioná **`tweets_antes_2025.js`** en lugar del archivo original.
