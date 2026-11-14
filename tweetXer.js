// ==UserScript==
// @name         TweetXer
// @namespace    https://github.com/lucahammer/tweetXer/
// @version      0.9.4
// @description  Borra todos tus Tweets gratis (versión en español).
// @author       Luca, dbort, pReya, Micolithe, STrRedWolf
// @license      NoHarm-draft
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @icon         https://www.google.com/s2/favicons?domain=twitter.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(async function () {
  if (window.TweetsXer && window.TweetsXer.isRunning) {
    console.log("TweetXer ya está cargado en esta página.");
    return;
  }

  const MAX_ATTEMPTS = 3;
  const MAX_RETRIES = MAX_ATTEMPTS - 1;
  const LONG_PAUSE_MS = 900 * 1000;
  const RETRY_DELAYS_MS = [10000, 30000];

  let TweetsXer = {
    isRunning: true,
    TweetCount: 0,
    dId: "exportUpload",
    tIds: [],
    tId: "",
    ratelimitreset: 0,
    skip: 0,
    total: 0,
    dCount: 0,
    deleteURL: "/i/api/graphql/VaenaVgh5q5ih7kvyVjgtg/DeleteTweet",
    unfavURL: "/i/api/graphql/ZYKSe-w7KEslx3JhSIk5LA/UnfavoriteTweet",
    deleteMessageURL:
      "/i/api/graphql/BJ6DtxA2llfjnRoRjaiIiw/DMMessageDeleteMutation",
    deleteConvoURL:
      "/i/api/1.1/dm/conversation/USER_ID-CONVERSATION_ID/delete.json",
    deleteDMsOneByOne: false,
    deleteQueryId: "VaenaVgh5q5ih7kvyVjgtg",
    unfavQueryId: "ZYKSe-w7KEslx3JhSIk5LA",
    username: "",
    action: "",
    bookmarksURL: "/i/api/graphql/L7vvM2UluPgWOW4GDvWyvw/Bookmarks?",
    bookmarks: [],
    bookmarksNext: "",
    baseUrl: "https://x.com",
    authorization:
      "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
    ct0: false,
    transaction_id: "",

    async init() {
      this.baseUrl = `https://${window.location.hostname}`;
      this.updateTransactionId();
      this.createUploadForm();
      this.ct0 = this.getCookie("ct0");
      this.username = document.location.href.split("/")[3].replace("#", "");
      await this.getTweetCount();
    },

    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    getCookie(name) {
      const match = `; ${document.cookie}`.match(`;\\s*${name}=([^;]+)`);
      return match ? match[1] : null;
    },

    updateTransactionId() {
      this.transaction_id = [...crypto.getRandomValues(new Uint8Array(95))].map(
        (x, i) => (
          (i = ((x / 255) * 61) | 0),
          String.fromCharCode(i + (i > 9 ? (i > 35 ? 61 : 55) : 48))
        ),
      ).join``;
    },

    updateTitle(text) {
      const el = document.getElementById("tweetsXer_title");
      if (el) el.textContent = text;
    },

    updateInfo(text) {
      const el = document.getElementById("info");
      if (el) el.textContent = text;
    },

    createProgressBar() {
      const existing = document.getElementById("progressbar");
      if (existing) existing.remove();
      const progressbar = document.createElement("progress");
      progressbar.id = "progressbar";
      progressbar.value = this.dCount;
      progressbar.max = this.total;
      progressbar.style = "width:100%";
      const parent = document.getElementById(this.dId);
      if (parent) parent.appendChild(progressbar);
    },

    updateProgressBar() {
      const bar = document.getElementById("progressbar");
      if (bar) bar.value = this.dCount;
      this.updateInfo(`${this.dCount} borrados. ${this.tId}`);
    },

    processFile() {
      const tn = document.getElementById(`${TweetsXer.dId}_file`);
      if (tn.files && tn.files[0]) {
        let fr = new FileReader();
        fr.onloadend = function (evt) {
          let cutpoint = evt.target.result.indexOf("= ");
          let filestart = evt.target.result.slice(0, cutpoint);
          let json = JSON.parse(evt.target.result.slice(cutpoint + 1));

          if (filestart.includes(".tweet_headers.")) {
            console.log("El archivo contiene Tweets.");
            TweetsXer.action = "untweet";
            TweetsXer.tIds = json.map((x) => x.tweet.tweet_id);
          } else if (
            filestart.includes(".tweets.") ||
            filestart.includes(".tweet.")
          ) {
            console.log("El archivo contiene Tweets.");
            TweetsXer.action = "untweet";
            TweetsXer.tIds = json.map((x) => x.tweet.id_str);
          } else if (filestart.includes(".like.")) {
            console.log("El archivo contiene Favoritos.");
            TweetsXer.action = "unfav";
            TweetsXer.tIds = json.map((x) => x.like.tweetId);
          } else if (
            filestart.includes(".direct_message_headers.") ||
            filestart.includes(".direct_message_group_headers.") ||
            filestart.includes(".direct_messages.") ||
            filestart.includes(".direct_message_groups.")
          ) {
            console.log("El archivo contiene Mensajes Directos.");
            TweetsXer.action = "undm";
            if (TweetsXer.deleteDMsOneByOne) {
              TweetsXer.tIds = json.map((c) =>
                c.dmConversation.messages.map((m) =>
                  m.messageCreate ? m.messageCreate.id : 0,
                ),
              );
              TweetsXer.tIds = TweetsXer.tIds.flat();
              TweetsXer.tIds = TweetsXer.tIds.filter((i) => i != 0);
            } else {
              TweetsXer.tIds = json.map((c) => c.dmConversation.conversationId);
            }
          } else {
            TweetsXer.updateInfo(
              "No se reconoce el contenido del archivo. Usá un archivo del export de datos de Twitter.",
            );
            console.log("No se reconoce el contenido del archivo.");
          }

          if (TweetsXer.action.length > 0) {
            TweetsXer.total = TweetsXer.tIds.length;
            const f = document.getElementById(`${TweetsXer.dId}_file`);
            if (f) f.remove();
            TweetsXer.createProgressBar();
          }

          if (TweetsXer.action == "untweet") {
            const skipEl = document.getElementById("skipCount");
            if (!skipEl || skipEl.value.length < 1) {
              TweetsXer.skip =
                TweetsXer.total -
                TweetsXer.TweetCount -
                parseInt(TweetsXer.total / 20);
              TweetsXer.skip = Math.max(0, TweetsXer.skip);
            } else {
              TweetsXer.skip = skipEl.value;
            }
            console.log(`Saltando los ${TweetsXer.skip} Tweets más viejos.`);
            TweetsXer.tIds.reverse();
            TweetsXer.tIds = TweetsXer.tIds.slice(TweetsXer.skip);
            TweetsXer.dCount = TweetsXer.skip;
            TweetsXer.tIds.reverse();
            TweetsXer.updateTitle(
              `TweetXer: Borrando ${TweetsXer.total} Tweets`,
            );
            TweetsXer.deleteTweets();
          } else if (TweetsXer.action == "unfav") {
            const skipEl = document.getElementById("skipCount");
            TweetsXer.skip =
              skipEl && skipEl.value.length > 0 ? skipEl.value : 0;
            TweetsXer.tIds = TweetsXer.tIds.slice(TweetsXer.skip);
            TweetsXer.dCount = TweetsXer.skip;
            TweetsXer.tIds.reverse();
            TweetsXer.updateTitle(
              `TweetXer: Borrando ${TweetsXer.total} Favoritos`,
            );
            TweetsXer.deleteFavs();
          } else if (TweetsXer.action == "undm") {
            const skipEl = document.getElementById("skipCount");
            TweetsXer.skip =
              skipEl && skipEl.value.length > 0 ? skipEl.value : 0;
            TweetsXer.tIds = TweetsXer.tIds.slice(TweetsXer.skip);
            TweetsXer.dCount = TweetsXer.skip;
            TweetsXer.tIds.reverse();
            if (TweetsXer.deleteDMsOneByOne) {
              TweetsXer.updateTitle(
                `TweetXer: Borrando ${TweetsXer.total} Mensajes`,
              );
              TweetsXer.deleteDMs();
            } else {
              TweetsXer.updateTitle(
                `TweetXer: Borrando ${TweetsXer.total} Conversaciones`,
              );
              TweetsXer.deleteConvos();
            }
          } else {
            TweetsXer.updateTitle(`TweetXer: Probá con otro archivo`);
          }
        };
        fr.readAsText(tn.files[0]);
      }
    },

    createUploadForm() {
      const existing = document.getElementById(this.dId);
      if (existing) existing.remove();

      const h2Class =
        document.querySelectorAll("h2")[1]?.getAttribute("class") || "";
      const div = document.createElement("div");
      div.id = this.dId;
      div.innerHTML = `
            <style>#${this.dId}{ z-index:99999; position: sticky; top:0px; left:0px; width:auto; margin:0 auto; padding: 20px 10%; background:#87CEFA; opacity:0.95; } #${this.dId} > *{padding:5px;} button{background-color:#eff3f4;border-radius:666px;padding:2px 10px;} a {color:blue;}</style>
            <div style="color:black">
                <h2 class="${h2Class}" id="tweetsXer_title">TweetXer (consola)</h2>
                <p id="info">Esperando carga de perfil...</p>
                <p id="start">
                    <input type="file" value="" id="${this.dId}_file" />
                    <a href="#" id="toggleAdvanced">Opciones avanzadas</a>
                <div id="advanced" style="display:none">
                    <label for="skipCount">Cuántos Tweets saltear antes de seleccionar archivo.</label>
                    <input id="skipCount" type="number" value="" />
                    <p><strong>Borrar lento (sin archivo)</strong> - máx 4000/h, menos confiable<br>
                        <button id="slowDelete" type="button">Borrado lento</button>
                    </p>
                    <p><strong>Dejar de seguir a todos</strong><br>
                        <button id="unfollowEveryone" type="button">Dejar de seguir a todos</button>
                    </p>
                    <p><a id="removeTweetXer" href="#">Quitar TweetXer</a></p>
                </div>
            </div>
            `;
      document.body.insertBefore(div, document.body.firstChild);
      document
        .getElementById("toggleAdvanced")
        .addEventListener("click", () => {
          const adv = document.getElementById("advanced");
          adv.style.display = adv.style.display == "none" ? "block" : "none";
        });
      document
        .getElementById(`${this.dId}_file`)
        .addEventListener("change", this.processFile, false);
      document
        .getElementById("slowDelete")
        .addEventListener("click", this.slowDelete, false);
      document
        .getElementById("unfollowEveryone")
        .addEventListener("click", this.unfollow, false);
      document
        .getElementById("removeTweetXer")
        .addEventListener("click", this.removeTweetXer, false);
    },

    async sendRequestWithRetry(url, body) {
      while (true) {
        let waitedByHeader = false;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            const response = await fetch(url, {
              headers: {
                authorization: TweetsXer.authorization,
                "content-type": "application/json",
                "x-client-transaction-id": TweetsXer.transaction_id,
                "x-csrf-token": TweetsXer.ct0,
                "x-twitter-active-user": "yes",
                "x-twitter-auth-type": "OAuth2Session",
              },
              referrer: `${TweetsXer.baseUrl}/${TweetsXer.username}/with_replies`,
              referrerPolicy: "strict-origin-when-cross-origin",
              body: body,
              method: "POST",
              mode: "cors",
              credentials: "include",
              signal: AbortSignal.timeout(15000),
            });

            if (response.status == 200) {
              TweetsXer.dCount++;
              TweetsXer.updateProgressBar();

              const remaining = response.headers.get("x-rate-limit-remaining");
              if (remaining != null && parseInt(remaining) < 1) {
                TweetsXer.ratelimitreset =
                  response.headers.get("x-rate-limit-reset");
                let sleeptime =
                  TweetsXer.ratelimitreset - Math.floor(Date.now() / 1000);
                while (sleeptime > 0) {
                  TweetsXer.updateInfo(
                    `Límite de peticiones alcanzado. Esperando ${sleeptime}s. ${TweetsXer.dCount} borrados.`,
                  );
                  await TweetsXer.sleep(1000);
                  sleeptime =
                    TweetsXer.ratelimitreset - Math.floor(Date.now() / 1000);
                }
              }
              return true;
            }

            if (response.status == 429) {
              const resetHeader = response.headers.get("x-rate-limit-reset");
              let sleeptime = resetHeader
                ? parseInt(resetHeader) - Math.floor(Date.now() / 1000)
                : 0;

              if (sleeptime > 0) {
                console.warn(
                  `429 con x-rate-limit-reset. Esperando ${sleeptime}s.`,
                );
                while (sleeptime > 0) {
                  TweetsXer.updateInfo(
                    `Límite de peticiones alcanzado. Esperando ${sleeptime}s. ${TweetsXer.dCount} borrados.`,
                  );
                  await TweetsXer.sleep(1000);
                  sleeptime =
                    parseInt(resetHeader) - Math.floor(Date.now() / 1000);
                }
                waitedByHeader = true;
                break;
              }
              console.warn(
                `429: límite de peticiones alcanzado (sin reset header). Intento ${attempt + 1}/${MAX_ATTEMPTS}.`,
              );
            } else {
              console.warn(
                `Error ${response.status}. Intento ${attempt + 1}/${MAX_ATTEMPTS}.`,
                response,
              );
            }

            if (attempt === MAX_ATTEMPTS - 1) break;

            const delayMs =
              RETRY_DELAYS_MS[attempt] + Math.floor(Math.random() * 1000);
            const retryEnd = Date.now() + delayMs;
            let secondsLeft = Math.ceil((retryEnd - Date.now()) / 1000);
            while (secondsLeft > 0) {
              const reason =
                response.status == 429 ? "429" : `error ${response.status}`;
              TweetsXer.updateInfo(
                `${reason}. Reintento ${attempt + 1}/${MAX_RETRIES} en ${secondsLeft}s. ${TweetsXer.dCount} borrados.`,
              );
              await TweetsXer.sleep(1000);
              secondsLeft = Math.ceil((retryEnd - Date.now()) / 1000);
            }
            continue;
          } catch (error) {
            const isTimeout =
              error.name === "AbortError" || error.name === "TimeoutError";
            console.warn(
              `${isTimeout ? "Timeout" : "Error de red"}. Intento ${attempt + 1}/${MAX_ATTEMPTS}:`,
              error.message,
            );

            if (attempt === MAX_ATTEMPTS - 1) break;

            const delayMs =
              RETRY_DELAYS_MS[attempt] + Math.floor(Math.random() * 1000);
            const retryEnd = Date.now() + delayMs;
            let secondsLeft = Math.ceil((retryEnd - Date.now()) / 1000);
            while (secondsLeft > 0) {
              TweetsXer.updateInfo(
                `${isTimeout ? "Timeout" : "Error de red"}. Reintento ${attempt + 1}/${MAX_RETRIES} en ${secondsLeft}s. ${TweetsXer.dCount} borrados.`,
              );
              await TweetsXer.sleep(1000);
              secondsLeft = Math.ceil((retryEnd - Date.now()) / 1000);
            }
            continue;
          }
        }

        if (!waitedByHeader) {
          console.log(
            `Se agotaron el intento y los ${MAX_RETRIES} reintentos. Pausando ${LONG_PAUSE_MS / 60000} minutos antes de volver a probar.`,
          );
          const longPauseEnd = Date.now() + LONG_PAUSE_MS;
          let secondsLeft = Math.ceil((longPauseEnd - Date.now()) / 1000);
          while (secondsLeft > 0) {
            TweetsXer.updateInfo(
              `Límite de peticiones alcanzado. Esperando ${secondsLeft}s. ${TweetsXer.dCount} borrados.`,
            );
            await TweetsXer.sleep(1000);
            secondsLeft = Math.ceil((longPauseEnd - Date.now()) / 1000);
          }
        }
      }
    },

    async deleteTweets() {
      while (this.tIds.length > 0) {
        this.tId = this.tIds.pop();
        const body = `{"variables":{"tweet_id":"${this.tId}","dark_request":false},"queryId":"${this.deleteQueryId}"}`;
        await this.sendRequestWithRetry(this.baseUrl + this.deleteURL, body);
      }
      this.tId = "";
      this.updateProgressBar();
      this.updateTitle("TweetXer: ¡Terminado!");
      this.updateInfo(`Listo. ${this.dCount} Tweets procesados.`);
    },

    async deleteFavs() {
      this.updateTitle("TweetXer: Borrando Favoritos");
      while (this.tIds.length > 0) {
        this.tId = this.tIds.pop();
        const body = `{"variables":{"tweet_id":"${this.tId}","dark_request":false},"queryId":"${this.unfavQueryId}"}`;
        await this.sendRequestWithRetry(this.baseUrl + this.unfavURL, body);
      }
      this.tId = "";
      this.updateTitle("TweetXer");
      this.updateProgressBar();
    },

    async deleteDMs() {
      while (this.tIds.length > 0) {
        this.tId = this.tIds.pop();
        const body = `{"variables":{"messageId":"${this.tId}"},"requestId":""}`;
        await this.sendRequestWithRetry(
          this.baseUrl + this.deleteMessageURL,
          body,
        );
      }
      this.tId = "";
      this.updateProgressBar();
    },

    async deleteConvos() {
      while (this.tIds.length > 0) {
        this.tId = this.tIds.pop();
        const url =
          this.baseUrl +
          this.deleteConvoURL.replace("USER_ID-CONVERSATION_ID", this.tId);
        try {
          const response = await fetch(url, {
            headers: {
              authorization: TweetsXer.authorization,
              "content-type": "application/x-www-form-urlencoded",
              "x-client-transaction-id": TweetsXer.transaction_id,
              "x-csrf-token": TweetsXer.ct0,
              "x-twitter-active-user": "yes",
              "x-twitter-auth-type": "OAuth2Session",
            },
            referrer: `${TweetsXer.baseUrl}/messages`,
            body: "dm_secret_conversations_enabled=false&krs_registration_enabled=true&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&dm_users=false&include_groups=true&include_inbox_timelines=true&include_ext_media_color=true&supports_reactions=true&supports_edit=true&include_conversation_info=true",
            method: "POST",
            mode: "cors",
            credentials: "include",
            signal: AbortSignal.timeout(15000),
          });
          if (response.status == 204) {
            TweetsXer.dCount++;
            TweetsXer.updateProgressBar();
            await TweetsXer.sleep(Math.floor(Math.random() * 200));
          } else if (response.status == 429 || response.status == 420) {
            console.log(
              `Mensaje 429/420. Esperando 5 minutos y reintentando esta conversación...`,
            );
            this.tIds.push(this.tId);
            await TweetsXer.sleep(5 * 60 * 1000);
          } else {
            console.warn(
              "Respuesta inesperada al borrar la conversación:",
              response.status,
            );
          }
        } catch (e) {
          console.warn("Error al borrar la conversación:", e);
          this.tIds.push(this.tId);
          await TweetsXer.sleep(5000);
        }
      }
      this.tId = "";
      this.updateProgressBar();
    },

    async getTweetCount() {
      await waitForElemToExist("header");
      await TweetsXer.sleep(1000);
      if (!document.querySelector('[data-testid="UserName"]')) {
        if (document.querySelector('[aria-label="Back"]')) {
          await TweetsXer.sleep(200);
          document.querySelector('[aria-label="Back"]').click();
          await TweetsXer.sleep(1000);
        } else if (document.querySelector('[data-testid="app-bar-back"]')) {
          document.querySelector('[data-testid="app-bar-back"]').click();
          await TweetsXer.sleep(1000);
        }
        if (document.querySelector('[data-testid="AppTabBar_Profile_Link"]')) {
          await TweetsXer.sleep(200);
          document
            .querySelector('[data-testid="AppTabBar_Profile_Link"]')
            .click();
        } else if (
          document.querySelector('[data-testid="DashButton_ProfileIcon_Link"]')
        ) {
          await TweetsXer.sleep(100);
          document
            .querySelector('[data-testid="DashButton_ProfileIcon_Link"]')
            .click();
          await TweetsXer.sleep(1000);
          document
            .querySelector('[data-testid="icon"]')
            .nextElementSibling.click();
        }
        await waitForElemToExist('[data-testid="UserName"]');
      }
      await TweetsXer.sleep(1000);

      function extractTweetCount(selector) {
        const element = document.querySelector(selector);
        if (!element) return null;
        const match = element.textContent.match(/((\d|,|\.|K)+) (\w+)$/);
        if (!match) return null;
        return match[1]
          .replace(/\.(\d+)K/, "$1".padEnd(4, "0"))
          .replace("K", "000")
          .replace(",", "")
          .replace(".", "");
      }

      try {
        TweetsXer.TweetCount = extractTweetCount(
          '[data-testid="primaryColumn"]>div>div>div',
        );
        if (!TweetsXer.TweetCount)
          TweetsXer.TweetCount = extractTweetCount(
            '[data-testid="TopNavBar"]>div>div',
          );
        if (!TweetsXer.TweetCount) {
          console.log("No se pudo detectar el conteo. Se asume 1M.");
          TweetsXer.TweetCount = 1000000;
        }
      } catch (error) {
        TweetsXer.TweetCount = 1000000;
      }
      this.updateInfo(
        "Seleccioná tu tweet-headers.js o tweets.js del export de datos para empezar.",
      );
      console.log(TweetsXer.TweetCount + " Tweets en el perfil.");
    },

    async slowDelete() {
      document.getElementById("start").remove();
      TweetsXer.total = TweetsXer.TweetCount;
      TweetsXer.createProgressBar();

      document.querySelectorAll('[data-testid="ScrollSnap-List"] a')[1].click();
      await TweetsXer.sleep(2000);

      let unretweet, confirmURT, caret, menu, confirmation;
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 5;
      const more = '[data-testid="tweet"] [data-testid="caret"]';

      while (document.querySelectorAll(more).length > 0) {
        await TweetsXer.sleep(1200);
        document
          .querySelectorAll('section [data-testid="cellInnerDiv"]>div>div>div')
          .forEach((x) => x.remove());
        document
          .querySelectorAll(
            'section [data-testid="cellInnerDiv"]>div>div>[role="link"]',
          )
          .forEach((x) => x.remove());

        try {
          const moreElement = document.querySelector(more);
          if (moreElement) moreElement.scrollIntoView({ behavior: "smooth" });

          unretweet = document.querySelector('[data-testid="unretweet"]');
          if (unretweet) {
            unretweet.click();
            confirmURT = await waitForElemToExist(
              '[data-testid="unretweetConfirm"]',
            );
            confirmURT.click();
          } else {
            caret = await waitForElemToExist(more);
            caret.click();
            menu = await waitForElemToExist('[role="menuitem"]');
            if (menu.textContent.includes("@")) {
              caret.click();
              document.querySelector('[data-testid="tweet"]').remove();
            } else {
              menu.click();
              confirmation = await waitForElemToExist(
                '[data-testid="confirmationSheetConfirm"]',
              );
              if (confirmation) confirmation.click();
            }
          }

          TweetsXer.dCount++;
          TweetsXer.updateProgressBar();
          consecutiveErrors = 0;
          if (TweetsXer.dCount % 100 == 0)
            console.log(
              `${new Date().toUTCString()} Borrados ${TweetsXer.dCount} Tweets`,
            );
        } catch (error) {
          console.error(`Error al borrar el Tweet: ${error.message}`);
          consecutiveErrors++;
          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.log(
              `${consecutiveErrors} errores consecutivos. Se detiene.`,
            );
            break;
          }
        }
      }
      console.log(`Terminado. Total borrados: ${TweetsXer.dCount} Tweets.`);
    },

    async unfollow() {
      let unfollowCount = 0;
      let next_unfollow, menu;
      document.querySelector('[href$="/following"]').click();
      await TweetsXer.sleep(1200);
      const accounts = '[data-testid="UserCell"]';
      while (
        document.querySelectorAll(
          '[data-testid="UserCell"] [data-testid$="-unfollow"]',
        ).length > 0
      ) {
        next_unfollow = document.querySelectorAll(accounts)[0];
        next_unfollow.scrollIntoView({ behavior: "smooth" });
        next_unfollow.querySelector('[data-testid$="-unfollow"]').click();
        menu = await waitForElemToExist(
          '[data-testid="confirmationSheetConfirm"]',
        );
        menu.click();
        next_unfollow.remove();
        unfollowCount++;
        if (unfollowCount % 10 == 0)
          console.log(
            `${new Date().toUTCString()} Dejaste de seguir ${unfollowCount} cuentas`,
          );
        await TweetsXer.sleep(Math.floor(Math.random() * 200));
      }
      console.log("No quedan cuentas por dejar de seguir.");
    },

    removeTweetXer(event) {
      if (event) event.preventDefault();
      const el = document.getElementById("exportUpload");
      if (el) el.remove();
      TweetsXer.isRunning = false;
    },
  };

  const waitForElemToExist = async (selector) => {
    const elem = document.querySelector(selector);
    if (elem) return elem;
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const elem = document.querySelector(selector);
        if (elem) {
          resolve(elem);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { subtree: true, childList: true });
    });
  };

  window.TweetsXer = TweetsXer;

  await TweetsXer.init();
  console.log(
    "%c TweetXer cargado ",
    "background:#87CEFA;color:black;font-weight:bold",
  );
})();
