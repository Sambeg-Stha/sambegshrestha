
(function () {
    'use strict';

    /* Grab all nav links from the page into a list (an array-like NodeList) */
    var links = document.querySelectorAll('.nav__link');

    /* highlight(item)
       Removes the 'is-active' class from every link,
       then adds it to the one the user clicked,
       so only the current link is highlighted. */
    function highlight(item) {
        links.forEach(function (link) {
            link.classList.remove('is-active');
        });
        item.classList.add('is-active');
    }

    /* loadEdits()
       On page load, checks localStorage for previously
       saved nav text and applies it, so edited labels
       survive a page refresh. */
    function loadEdits() {
        links.forEach(function (link, i) {
            var saved = localStorage.getItem('nav-text-' + i);
            if (saved) {
                link.textContent = saved;
            }
        });
    }

    /* saveEdit(link, i)
       Saves the edited text of one link into localStorage
       under the key 'nav-text-<index>' so it can be restored later. */
    function saveEdit(link, i) {
        localStorage.setItem('nav-text-' + i, link.textContent.trim());
    }

    /* Attach event listeners to every nav link */
    links.forEach(function (link, i) {
        /* CLICK: highlight the clicked link and stop the page jumping */
        link.addEventListener('click', function (e) {
            e.preventDefault();
            highlight(link);
        });

        /* DOUBLE-CLICK: make the text editable so you can rename the link */
        link.addEventListener('dblclick', function (e) {
            e.preventDefault();
            link.contentEditable = 'true';
            link.focus();
        });

        /* BLUR: when the user clicks away, turn editing off and save */
        link.addEventListener('blur', function () {
            link.contentEditable = 'false';
            saveEdit(link, i);
        });

        /* KEYDOWN: pressing Enter saves and exits editing mode */
        link.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                link.blur();
            }
        });
    });

    /* Run once on load to restore any saved nav text */
    loadEdits();
})();
