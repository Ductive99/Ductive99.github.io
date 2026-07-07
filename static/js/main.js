// ============================================
// Theme Toggle
// ============================================
(function () {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  toggle.addEventListener('click', function () {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
})();

// ============================================
// Mobile Menu
// ============================================
(function () {
  const btn = document.getElementById('mobile-menu-toggle');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', function () {
    btn.classList.toggle('open');
    nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', nav.classList.contains('open'));
  });
})();

// ============================================
// Library Category Filter
// ============================================
(function () {
  const filterBar = document.getElementById('book-filters');
  if (!filterBar) return;

  filterBar.addEventListener('click', function (e) {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    // Update active state
    filterBar.querySelectorAll('.filter-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    btn.classList.add('active');

    var category = btn.getAttribute('data-category');
    var cards = document.querySelectorAll('.book-card');

    cards.forEach(function (card) {
      if (category === 'all') {
        card.setAttribute('data-hidden', 'false');
      } else {
        var cats = card.getAttribute('data-categories') || '';
        if (cats.indexOf(category) !== -1) {
          card.setAttribute('data-hidden', 'false');
        } else {
          card.setAttribute('data-hidden', 'true');
        }
      }
    });
  });
})();

// ============================================
// Blog Tag Filter
// ============================================
(function () {
  const filterBar = document.getElementById('blog-tag-filters');
  if (!filterBar) return;

  filterBar.addEventListener('click', function (e) {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    filterBar.querySelectorAll('.filter-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    btn.classList.add('active');

    var tag = btn.getAttribute('data-tag');
    var items = document.querySelectorAll('.blog-post-item');

    items.forEach(function (item) {
      if (tag === 'all') {
        item.style.display = '';
      } else {
        var tags = item.getAttribute('data-tags') || '';
        if (tags.indexOf(tag) !== -1) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      }
    });
  });
})();
