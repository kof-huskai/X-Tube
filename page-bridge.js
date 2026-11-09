/* Runs in the page's MAIN world so it can read YouTube's player data; talks to content.js via postMessage. */
(() => {
  function read() {
    try {
      const flexy = document.querySelector("ytd-watch-flexy");
      const pr = (flexy && flexy.playerData) || window.ytInitialPlayerResponse;
      const vd = pr && pr.videoDetails;
      if (!vd) return null;
      const mf = pr.microformat && pr.microformat.playerMicroformatRenderer;
      return { videoId: vd.videoId, title: vd.title, author: vd.author, views: vd.viewCount, lengthSeconds: vd.lengthSeconds,
        keywords: vd.keywords || [], description: vd.shortDescription || "", published: (mf && mf.publishDate) || "",
        captionTracks: ((pr.captions && pr.captions.playerCaptionsTracklistRenderer && pr.captions.playerCaptionsTracklistRenderer.captionTracks) || [])
          .map(t => ({ baseUrl: t.baseUrl, languageCode: t.languageCode, kind: t.kind || "" })) };
    } catch (e) { return null; }
  }
  window.addEventListener("message", e => {
    if (e.source === window && e.data && e.data.tm === "REQ_VIDEO") window.postMessage({ tm: "RES_VIDEO", id: e.data.id, data: read() }, "*");
  });
})();
