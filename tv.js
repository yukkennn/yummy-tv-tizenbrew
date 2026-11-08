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
  function detail(anime, previous, watch) {
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
            play(anime, video, function () { detail(anime, previous, watch); },
              watch && watch.video_id === video.video_id && watch.end_time < watch.duration - 10 ? watch.end_time : 0);
          }, 'row');
        });
      }
      if (watch) {
        var matching = videos.filter(function (video) { return video.video_id === watch.video_id; })[0];
        if (matching) episode.value = String(matching.number || matching.index || '—');
      }
      episode.onchange = renderSources;
      renderSources();
    });
    focus();
  }
  function now() { return Math.floor(Date.now() / 1000); }
  function play(anime, source, previous, resume) {
    var url = source.iframe_url || '';
    var current = show(anime.title + ' · серия ' + source.number, previous);
    button(screen, 'Назад к сериям', previous);
    if (!/^https:\/\//i.test(url)) {
      message('Источник не предоставил ссылку HTTPS.');
      focus();
      return;
    }
    var direct = /\.(m3u8|mp4|mpd|webm)(?:[?#]|$)/i.test(url);
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
      var frame = add(screen, 'iframe');
      frame.title = 'Плеер источника';
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('tabindex', '0');
      frame.src = url;
      button(screen, 'Отметить серию просмотренной', function () {
        var duration = Number(source.duration) || 0;
        if (!duration) return message('Источник не указал длительность, отметка недоступна.');
        sync(duration, duration, true);
      });
      message('Встроенный плеер. По окончании можно сохранить просмотр кнопкой под видео.');
    }
    focus();
  }
  function goBack() {
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
    if ((active.tagName === 'INPUT' && event.keyCode % 2) ||
        ((active.tagName === 'SELECT' || active.tagName === 'VIDEO') && event.keyCode % 2)) return;
    var targets = document.querySelectorAll('button:not([disabled]),input,select,video,iframe');
    var origin = active.getBoundingClientRect();
    var best;
    var bestScore = Infinity;
    var horizontal = event.keyCode % 2;
    var direction = event.keyCode <= 38 ? -1 : 1;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i] === active) continue;
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
