/* BlackRabbit UI v0.3.0 | MIT */
(function () {
  'use strict';

  const root = document.documentElement;
  const config = {
    home: document.body.dataset.brHome || 'https://blackrabbitdeveloper.github.io/',
    navigation: document.body.dataset.brNavigation !== 'false',
    target: document.body.dataset.brNavigationTarget || '',
  };

  function preferredTheme() {
    const stored = localStorage.getItem('utils-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem('utils-theme', theme);
    document.querySelectorAll('.br-global-nav__theme').forEach((button) => {
      button.textContent = theme === 'dark' ? '☀ Light' : '◐ Dark';
      button.setAttribute('aria-label', theme === 'dark' ? '라이트 테마 사용' : '다크 테마 사용');
    });
    document.dispatchEvent(new CustomEvent('blackrabbit:themechange', { detail: { theme } }));
  }

  function createNavigation() {
    const nav = document.createElement('nav');
    nav.className = 'br-global-nav';
    nav.setAttribute('aria-label', 'BlackRabbit Utils');

    const home = document.createElement('a');
    home.className = 'br-global-nav__home';
    home.href = config.home;
    home.textContent = '← Home';
    home.setAttribute('aria-label', 'BlackRabbit Utils 홈으로 이동');

    const theme = document.createElement('button');
    theme.type = 'button';
    theme.className = 'br-global-nav__theme';
    theme.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

    nav.append(home, theme);
    const target = config.target ? document.querySelector(config.target) : null;
    if (target) target.prepend(nav);
    else {
      nav.classList.add('br-global-nav--floating');
      document.body.prepend(nav);
    }
  }

  if (config.navigation && !document.querySelector('.br-global-nav')) createNavigation();
  applyTheme(preferredTheme());

  window.BlackRabbitUI = Object.freeze({
    version: '0.3.0',
    getTheme: () => root.dataset.theme,
    setTheme: applyTheme,
  });
}());
