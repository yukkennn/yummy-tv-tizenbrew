(function () {
  'use strict';
  var screen = document.getElementById('screen');
  var status = document.getElementById('status');
  var menu = document.getElementById('menu');
  var key = localStorage.getItem('yummy.key') || '';
  var token = localStorage.getItem('yummy.token') || '';
  var page = 0;
  var back = null;
  var stopPlayer = null;
  var lists = ['Смотрю', 'В планах', 'Просмотрено', 'Брошено', 'Избранное', 'Отложено'];

  function message(text) { status.textContent = text; }
  function add(parent, tag, text) {
    var node = document.createElement(tag);
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  }
  function button(parent, text, action, className) {
    var node = add(parent, 'button', text);
    node.className = className || '';
    node.onclick = action;
    return node;
  }
  function input(label, value, type) {
    var wrapper = add(screen, 'label', label + ' ');
    var node = add(wrapper, 'input');
    node.type = type || 'text';
    node.value = value || '';
    add(screen, 'br');
    return node;
  }
  function show(title, previous) {
    document.body.classList.remove('tv-fullscreen');
    if (stopPlayer) {
      stopPlayer();
      stopPlayer = null;
    }
    page += 1;
    back = previous;
    screen.textContent = '';
    screen.scrollTop = 0;
    add(screen, 'h1', title);
    message('');
    return page;
  }
  function focus() {
    var first = screen.querySelector('button,input,select') || menu.querySelector('button');
    if (first) first.focus();
  }
  function api(path, method, data, auth) {
    return new Promise(function (resolve, reject) {
      if (!key) return reject(new Error('Добавь ключ X-Application в разделе «Аккаунт».'));
      if (auth && !token) return reject(new Error('Войди в аккаунт YummyAnime.'));
      var xhr = new XMLHttpRequest();
      xhr.open(method || 'GET', 'https://api.yani.tv' + path);
      xhr.timeout = 15000;
      xhr.setRequestHeader('X-Application', key);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('Lang', 'ru');
      if (token && path !== '/profile/login') xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      if (data) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        if (xhr.status === 420) return reject(new Error('YummyAnime запросил капчу. Повтори вход позже.'));
        if (xhr.status < 200 || xhr.status >= 300) {
          return reject(new Error('YummyAnime вернул HTTP ' + xhr.status + '. Проверь ключ или войди заново.'));
        }
        try { resolve(xhr.responseText ? JSON.parse(xhr.responseText).response : null); }
        catch (error) { reject(new Error('Не удалось прочитать ответ YummyAnime.')); }
      };
      xhr.onerror = xhr.ontimeout = function () { reject(new Error('Нет ответа от YummyAnime.')); };
      xhr.send(data ? JSON.stringify(data) : null);
    });
  }
  function load(promise, render) {
    var current = page;
    message('Загрузка…');
    promise.then(function (data) {
      if (page !== current) return;
      message('');
      render(data);
      focus();
    }).catch(function (error) { if (page === current) message(error.message); });
  }
  function setToken(value) {
    token = value || '';
    localStorage.setItem('yummy.token', token);
    localStorage.setItem('yummy.refreshed', String(Date.now()));
  }
  function account() {
    show('Аккаунт YummyAnime', catalog);
    var application = input('Публичный ключ X-Application', key, 'password');
    button(screen, 'Сохранить ключ', function () {
      key = application.value.trim();
      localStorage.setItem('yummy.key', key);
      message(key ? 'Ключ сохранён.' : 'Ключ удалён.');
    });
    var resolver = input('Сервер видео (необязательно)', localStorage.getItem('yummy.resolver') || '');
    resolver.placeholder = 'http://192.168.0.166:8791';
    button(screen, 'Сохранить сервер видео', function () {
      var value = resolver.value.trim().replace(/\/+$/, '');
      try {
        var address = value && new URL(value);
        if (address && (!/^https?:$/.test(address.protocol) || address.username || address.password ||
            address.search || address.hash || address.pathname !== '/')) throw new Error();
      } catch (error) { return message('Введи адрес сервера в формате http://адрес:порт.'); }
      localStorage.setItem('yummy.resolver', value);
      message(value ? 'Сервер видео сохранён.' : 'Сервер видео отключён.');
    });
    if (token) {
      var profile = add(screen, 'p', 'Вход выполнен.');
      api('/profile', 'GET', null, true).then(function (user) {
        if (user) profile.textContent = 'Аккаунт: ' + (user.nickname || user.login || user.username || 'YummyAnime');
      }).catch(function (error) { if (profile.parentNode === screen) message(error.message); });
      button(screen, 'Выйти', function () { setToken(''); account(); });
    } else {
      var login = input('Логин или email');
      var password = input('Пароль', '', 'password');
      var signIn = button(screen, 'Войти', function () {
        if (!login.value.trim() || !password.value) return message('Введи логин и пароль.');
        var current = page;
        var body = {login: login.value.trim(), password: password.value, need_json: true};
        password.value = '';
        signIn.disabled = true;
        message('Вход…');
        api('/profile/login', 'POST', body).then(function (result) {
          if (!result || !result.token) throw new Error('YummyAnime не выдал токен.');
          setToken(result.token);
          if (page === current) account();
        }).catch(function (error) {
          signIn.disabled = false;
          if (page === current) message(error.message);
        });
      });
      add(screen, 'p', 'Ключ приложения можно создать на yummyani.me/dev/applications.');
    }
    focus();
  }
  function cards(items, parent, previous) {
    if (!Array.isArray(items) || !items.length) return add(parent, 'p', 'Здесь пока пусто.');
    var grid = add(parent, 'div');
    grid.className = 'grid';
    items.forEach(function (item) {
      var anime = item.anime || item;
      if (!anime.anime_id) return;
      var card = button(grid, anime.title || 'Аниме', function () { detail(anime, previous); }, 'card');
      if (anime.poster && /^https:\/\//i.test(anime.poster.medium || '')) {
        var image = document.createElement('img');
        image.alt = '';
        image.src = anime.poster.medium;
        card.insertBefore(image, card.firstChild);
      }
    });
  }
  function catalog(query, offset) {
    query = typeof query === 'string' ? query : '';
    offset = offset || 0;
    show('Каталог', null);
    var search = add(screen, 'input');
    search.placeholder = 'Название аниме';
    search.value = query;
    search.setAttribute('aria-label', 'Название аниме');
    button(screen, 'Найти', function () { catalog(search.value.trim(), 0); });
    search.onkeydown = function (event) {
      if (event.keyCode === 13 && search.value.trim()) catalog(search.value.trim(), 0);
    };
    var results = add(screen, 'section');
    function reopen() { catalog(query, offset); }
    load(api('/anime?limit=18&offset=' + offset + (query ? '&q=' + encodeURIComponent(query) : '')), function (items) {
      cards(items, results, reopen);
      if (offset) button(results, 'Назад по каталогу', function () { catalog(query, offset - 18); });
      if (items && items.length === 18) button(results, 'Ещё', function () { catalog(query, offset + 18); });
    });
    focus();
  }
  function library() {
    show('Мои списки', catalog);
    var results = add(screen, 'section');
    lists.forEach(function (name, id) {
      button(screen, name, function () {
        results.textContent = '';
        load(api('/profile', 'GET', null, true).then(function (user) {
          if (!user || !user.id) throw new Error('Не удалось определить ID аккаунта.');
          return api('/users/' + user.id + '/lists/' + id, 'GET', null, true);
        }), function (data) { cards(Array.isArray(data) ? data : data && (data.animes || data.anime || data.items), results, library); });
      });
    });
    screen.appendChild(results);
    focus();
  }
  function history() {
    show('Продолжить просмотр', catalog);
    load(api('/video/last-watches', 'GET', null, true), function (items) {
      if (!Array.isArray(items) || !items.length) return add(screen, 'p', 'История пока пуста.');
      items.forEach(function (watch) {
        if (!watch.anime_id) return;
        button(screen, watch.title + ' · ' + (watch.ep_title || 'Последняя серия'), function () {
          detail(watch, history, watch);
        }, 'row');
      });
    });
    focus();
  }
  function detail(anime, previous, watch, selectedEpisode) {
    show(anime.title || 'Аниме', previous);
    var path = '/anime/' + anime.anime_id;
    if (anime.description) add(screen, 'p', anime.description.replace(/<[^>]*>/g, ''));
    var tools = add(screen, 'div');
    if (token) {
      var choice = add(tools, 'select');
      choice.setAttribute('aria-label', 'Список');
      var noList = add(choice, 'option', 'Убрать из списка');
      noList.value = '';
      lists.forEach(function (name, id) {
        if (id !== 4) add(choice, 'option', name).value = String(id);
      });
      if (anime.user && anime.user.list && anime.user.list.list) choice.value = String(anime.user.list.list.id);
      function change(route, method, payload, text) {
        load(api(path + route, method, payload, true), function () { message(text); });
      }
      button(tools, 'Сохранить список', function () {
        change('/list', choice.value === '' ? 'DELETE' : 'PUT',
          choice.value === '' ? null : {list: Number(choice.value), date: now()}, 'Список обновлён.');
      });
      button(tools, 'В избранное', function () { change('/list/fav', 'PUT', {date: now()}, 'Добавлено в избранное.'); });
      button(tools, 'Убрать из избранного', function () { change('/list/fav', 'DELETE', null, 'Убрано из избранного.'); });
    }
    var rows = add(screen, 'section');
    load(api(path + '/videos'), function (videos) {
      if (!Array.isArray(videos) || !videos.length) return add(rows, 'p', 'У этого аниме нет доступных видео.');
      var episode = add(rows, 'select');
      episode.setAttribute('aria-label', 'Серия');
      var groups = {};
      videos.forEach(function (video) {
        var number = String(video.number || video.index || '—');
        if (!groups[number]) groups[number] = [];
        groups[number].push(video);
      });
      Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (number) {
        add(episode, 'option', 'Серия ' + number).value = number;
      });
      var sources = add(rows, 'div');
      function renderSources() {
        sources.textContent = '';
        groups[episode.value].forEach(function (video) {
          var data = video.data || {};
          button(sources, (data.dubbing || 'Озвучка') + ' · ' + (data.player || 'Плеер'), function () {
            var selected = episode.value;
            play(anime, video, function () { detail(anime, previous, watch, selected); },
              watch && watch.video_id === video.video_id && watch.end_time < watch.duration - 10 ? watch.end_time : 0);
          }, 'row');
        });
      }
      if (watch) {
        var matching = videos.filter(function (video) { return video.video_id === watch.video_id; })[0];
        if (matching) episode.value = String(matching.number || matching.index || '—');
      }
      if (selectedEpisode && groups[selectedEpisode]) episode.value = selectedEpisode;
      episode.onchange = renderSources;
      renderSources();
      episode.focus();
    });
    focus();
  }
  function now() { return Math.floor(Date.now() / 1000); }
  function sourceUrl(source) {
    var data = source.data || {};
    if (typeof data === 'string') {
      try { data = JSON.parse(data) || {}; }
      catch (error) { data = {}; }
    }
    var candidates = [source.yani_stream_url, data.yani_stream_url, source.iframe_url,
      source.url, source.player_url, source.link, data.iframe_url, data.url, data.player_url, data.link];
    for (var i = 0; i < candidates.length; i++) {
      if (typeof candidates[i] !== 'string') continue;
      var url = candidates[i].trim();
      if (url.indexOf('//') === 0) url = 'https:' + url;
      if (/^http:\/\/(?:www\.)?kodik\./i.test(url)) url = 'https://' + url.slice(7);
      if (/^https?:\/\/[^\/\s?#]+/i.test(url)) return url;
    }
    return '';
  }
  function play(anime, source, previous, resume, resolved) {
    var url = resolved || sourceUrl(source);
    var current = show(anime.title + ' · серия ' + source.number, previous);
    button(screen, 'Другой источник / к сериям', previous);
    if (!url) {
      message('У этого источника нет ссылки на плеер. Попробуй другую озвучку или источник.');
      focus();
      return;
    }
    var direct = resolved || /\.(m3u8|mp4|mpd|webm)(?:[?#]|$)/i.test(url);
    var resolverBase = localStorage.getItem('yummy.resolver');
    if (!direct && resolved !== false && resolverBase && /(^|\.)(alloha\.yani\.tv|aksor\.tv|kodikplayer\.com|kodik\.info)$/i.test(new URL(url).hostname)) {
      var request = new XMLHttpRequest();
      request.open('GET', resolverBase + '/resolve?url=' + encodeURIComponent(url));
      request.timeout = 45000;
      message('Ищу прямой поток…');
      function failed() {
        if (page !== current) return;
        message('Сервер не нашёл прямой поток.');
        button(screen, 'Открыть встроенный плеер', function () {
          play(anime, source, previous, resume, false);
        }).focus();
      }
      request.onload = function () {
        if (page !== current) return;
        try {
          var stream = JSON.parse(request.responseText).url;
          if (request.status !== 200 || !/^https?:\/\//i.test(stream)) return failed();
          play(anime, source, previous, resume, stream);
        } catch (error) { failed(); }
      };
      request.onerror = request.ontimeout = failed;
      request.send();
      focus();
      return;
    }
    var saved = 0;
    var busy = false;
    var queued = null;
    var session = token;
    function sync(time, duration, manual) {
      if (!session || token !== session || !source.video_id) {
        if (manual) message('Войди в аккаунт перед сохранением просмотра.');
        return;
      }
      time = Math.floor(time || 0);
      duration = isFinite(duration) ? Math.floor(duration || 0) : 0;
      if (!manual && (time < 1 || time === saved)) return;
      queued = {time: time, duration: duration, date: now()};
      if (busy) return;
      function send() {
        if (!queued || token !== session) return;
        busy = true;
        var update = queued;
        queued = null;
        api('/video/' + source.video_id, 'PUT', update, true).then(function () {
          saved = update.time;
          if (page === current) message('Просмотр сохранён в YummyAnime.');
        }).catch(function (error) {
          if (page === current) message(error.message);
        }).then(function () { busy = false; send(); });
      }
      send();
    }
    if (direct && window.webapis && window.webapis.avplay && !/\.webm(?:[?#]|$)/i.test(url)) {
      var player = window.webapis.avplay;
      var toggle = button(screen, 'Пауза / продолжить', function () {
        try {
          if (player.getState() === 'PLAYING') {
            player.pause();
            savePosition();
          } else if (player.getState() === 'PAUSED') player.play();
        } catch (error) { message('Не удалось переключить воспроизведение.'); }
      });
      var surface = add(screen, 'object');
      surface.type = 'application/avplayer';
      surface.className = 'avsurface';
      document.body.classList.add('avplaying');
      var nativeTimer;
      function savePosition() {
        try { sync(player.getCurrentTime() / 1000, player.getDuration() / 1000); }
        catch (error) { /* The player may still be preparing. */ }
      }
      function seek(delta) {
        try {
          if (['PLAYING', 'PAUSED'].indexOf(player.getState()) === -1) return;
          var target = Math.max(0, Math.min(player.getDuration() - 1000, player.getCurrentTime() + delta));
          player.seekTo(target);
        } catch (error) { message('Не удалось перемотать видео.'); }
      }
      var forward = button(screen, '+30 сек', function () { seek(30000); });
      var rewind = button(screen, '−30 сек', function () { seek(-30000); });
      screen.insertBefore(forward, surface);
      screen.insertBefore(rewind, surface);
      function playerError() {
        if (page === current) message('Samsung AVPlay не смог запустить этот поток. Попробуй другой источник.');
      }
      stopPlayer = function () {
        clearInterval(nativeTimer);
        savePosition();
        try { player.close(); } catch (error) { /* The player may already be closed. */ }
        document.body.classList.remove('avplaying');
      };
      try {
        player.open(url);
        player.setListener({onerror: playerError, onstreamcompleted: savePosition});
        var area = surface.getBoundingClientRect();
        var sx = 1920 / window.innerWidth;
        var sy = 1080 / window.innerHeight;
        player.setDisplayRect(Math.round(area.left * sx), Math.round(area.top * sy),
          Math.round(area.width * sx), Math.round(area.height * sy));
        player.prepareAsync(function () {
          if (page !== current) return;
          try {
            if (resume && resume * 1000 < player.getDuration()) player.seekTo(resume * 1000);
            player.play();
            nativeTimer = setInterval(function () {
              if (player.getState() === 'PLAYING') savePosition();
            }, 20000);
            toggle.focus();
          } catch (error) { playerError(); }
        }, playerError);
      } catch (error) { playerError(); }
    } else if (direct) {
      var video = add(screen, 'video');
      video.controls = true;
      video.src = url;
      var playbackButton = button(screen, 'Воспроизвести / пауза', function () {
        if (!video.paused) return video.pause();
        var attempt = video.play();
        if (attempt && attempt.catch) attempt.catch(function () { message('Телевизор не смог запустить поток.'); });
      });
      screen.insertBefore(playbackButton, video);
      addFullscreen(video, playbackButton.onclick);
      video.onloadedmetadata = function () {
        if (resume && resume < video.duration) video.currentTime = resume;
      };
      var timer = setInterval(function () { if (!video.paused) sync(video.currentTime, video.duration); }, 20000);
      video.onpause = video.onended = function () { sync(video.currentTime, video.duration); };
      video.onerror = function () { message('Не удалось воспроизвести поток на телевизоре.'); };
      stopPlayer = function () {
        clearInterval(timer);
        sync(video.currentTime, video.duration);
        video.onpause = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
      };
      var pending = video.play();
      if (pending && pending.catch) pending.catch(function () { if (page === current) message('Нажми Play в плеере.'); });
    } else {
      var target = new URL(url);
      var kodik = /(^|\.)kodik(?:player|info)?\./i.test(target.hostname);
      if (/(^|\.)alloha\.yani\.tv$/i.test(target.hostname)) {
        target.searchParams.set('autoplay', '1');
        target = new URL('https://yummyanime.github.io/yummy-lampa-plugin/embed/alloha.html?url=' +
          encodeURIComponent(target.href));
      }
      var frame;
      var playing = false;
      function openFrame() {
        frame.src = target.href;
        message('Если видео не началось, попробуй «Другой источник / к сериям».');
      }
      function playerEvent(event) {
        if (event.source !== frame.contentWindow || event.origin !== target.origin || !event.data) return;
        if (event.data.key === 'kodik_player_play') {
          playing = true;
          message('');
        } else if (event.data.key === 'kodik_player_pause' || event.data.key === 'kodik_player_end') {
          playing = false;
        }
      }
      var start = button(screen, kodik ? 'Воспроизвести / пауза' : 'Перейти в плеер', function () {
        if (kodik) {
          frame.contentWindow.postMessage({key: 'kodik_player_api', value: {method: playing ? 'pause' : 'play'}}, target.origin);
        } else {
          frame.focus();
          frame.contentWindow.focus();
        }
      });
      button(screen, 'Перезагрузить плеер', openFrame);
      button(screen, 'Отметить серию просмотренной', function () {
        var duration = Number(source.duration) || 0;
        if (!duration) return message('Источник не указал длительность, отметка недоступна.');
        sync(duration, duration, true);
      });
      frame = add(screen, 'iframe');
      frame.title = 'Плеер источника';
      frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('tabindex', '-1');
      addFullscreen(frame, kodik ? start.onclick : null);
      if (kodik) window.addEventListener('message', playerEvent);
      stopPlayer = function () {
        document.body.classList.remove('tv-fullscreen');
        window.removeEventListener('message', playerEvent);
      };
      openFrame();
      start.focus();
      return;
    }
    focus();
  }
  function addFullscreen(media, playback) {
    var controls = add(screen, 'div');
    controls.className = 'fullscreen-controls';
    var exit = button(controls, 'Выйти из полноэкранного режима', leave);
    if (playback) button(controls, 'Воспроизвести / пауза', playback);
    function leave() {
      document.body.classList.remove('tv-fullscreen');
      toggle.focus();
    }
    var toggle = button(screen, 'На весь экран', function () {
      document.body.classList.add('tv-fullscreen');
      exit.focus();
    });
    screen.insertBefore(toggle, media);
    media.classList.add('fullscreen-media');
  }
  function goBack() {
    if (document.body.classList.contains('tv-fullscreen')) {
      var exit = screen.querySelector('.fullscreen-controls button');
      if (exit) exit.click();
      return;
    }
    if (back) back();
    else if (window.tizen) tizen.application.getCurrentApplication().exit();
  }
  document.addEventListener('tizenhwkey', function (event) {
    if (event.keyName === 'back') goBack();
  });
  document.addEventListener('keydown', function (event) {
    if (event.keyCode === 10009 || event.keyCode === 27) {
      event.preventDefault();
      goBack();
      return;
    }
    if (event.keyCode < 37 || event.keyCode > 40) return;
    var active = document.activeElement;
    if (active.tagName === 'SELECT' && event.keyCode % 2 && active.options.length) {
      var index = Math.max(0, Math.min(active.options.length - 1, active.selectedIndex + (event.keyCode === 37 ? -1 : 1)));
      if (index !== active.selectedIndex) {
        active.selectedIndex = index;
        active.dispatchEvent(new Event('change'));
      }
      event.preventDefault();
      return;
    }
    if ((active.tagName === 'INPUT' && event.keyCode % 2) ||
        ((active.tagName === 'SELECT' || active.tagName === 'VIDEO') && event.keyCode % 2)) return;
    var selector = document.body.classList.contains('tv-fullscreen')
      ? '.fullscreen-controls button' : 'button:not([disabled]),input,select,video';
    var targets = document.querySelectorAll(selector);
    var origin = active.getBoundingClientRect();
    var best;
    var bestScore = Infinity;
    var horizontal = event.keyCode % 2;
    var direction = event.keyCode <= 38 ? -1 : 1;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i] === active || !targets[i].getClientRects().length) continue;
      var rect = targets[i].getBoundingClientRect();
      var dx = (rect.left + rect.right - origin.left - origin.right) / 2;
      var dy = (rect.top + rect.bottom - origin.top - origin.bottom) / 2;
      var primary = direction * (horizontal ? dx : dy);
      var cross = Math.abs(horizontal ? dy : dx);
      var score = primary + cross * 4;
      if (primary > 5 && score < bestScore) {
        best = targets[i];
        bestScore = score;
      }
    }
    if (best) {
      event.preventDefault();
      best.focus();
    }
  });
  button(menu, 'Каталог', catalog);
  button(menu, 'Продолжить', history);
  button(menu, 'Мои списки', library);
  button(menu, 'Аккаунт', account);
  if (key && token && Date.now() - Number(localStorage.getItem('yummy.refreshed')) > 172800000) {
    var old = token;
    api('/profile/token', 'GET', null, true).then(function (result) {
      if (token === old && result && result.token) setToken(result.token);
    }).catch(function () {});
  }
  if (key) catalog();
  else account();
}());
