/* Animation system JS — Intersection Observer
   - Watches all elements with a data-animate attribute
   - Adds the 'is-visible' class when they enter the viewport
   - Future-proof: just add data-animate="fade-up" to any new element
*/
(function () {
    'use strict';

    var targets = document.querySelectorAll('[data-animate]');
    if (!targets.length) return;

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;

            var el = entry.target;

            /* Read optional delay: data-animate-delay="0.2" (in seconds) */
            var delay = el.getAttribute('data-animate-delay');
            if (delay) {
                el.style.setProperty('--anim-delay', delay + 's');
            }

            el.classList.add('is-visible');
            observer.unobserve(el); /* Animate once, not every scroll */
        });
    }, {
        threshold: 0.15
        /* Fires when at least 15% of the element is visible */
    });

    targets.forEach(function (el) {
        observer.observe(el);
    });
})();