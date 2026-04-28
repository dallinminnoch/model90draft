(function () {
  const LensApp = window.LensApp || (window.LensApp = {});

  function loadJson(key) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function loadJsonSession(key) {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  LensApp.storage = Object.assign(LensApp.storage || {}, {
    loadJson,
    loadJsonSession
  });
})();