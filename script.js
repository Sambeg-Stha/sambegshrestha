/* ---------- Content protection ---------- */

/* Disable the right-click menu on the page */
document.addEventListener('contextmenu', (event) => event.preventDefault());

/* Images cannot be dragged out of the page */
document.addEventListener('dragstart', (event) => {
    if (event.target instanceof HTMLImageElement) {
        event.preventDefault();
    }
});

document.querySelectorAll('img').forEach((image) => {
    image.setAttribute('draggable', 'false');
    image.addEventListener('dragstart', (event) => event.preventDefault());
});

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is_visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.2 });

document.querySelectorAll('.page').forEach(page => observer.observe(page));

/* ---------- Works topic navigation ---------- */

const topicNav = document.querySelector('[data-topic-nav]');

if (topicNav) {
    const links = Array.from(topicNav.querySelectorAll('.topic-nav__link'));
    const sections = links
        .map((link) => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    if (sections.length) {
        const setActive = (id) => {
            links.forEach((link) => {
                if (link.hash === `#${id}`) {
                    link.setAttribute('aria-current', 'location');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        };

        /* Highlight the topic whose section is crossing the middle of the viewport */
        const spy = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) setActive(entry.target.id);
            });
        }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

        sections.forEach((section) => spy.observe(section));
    }
}

/* ---------- Art marquee ---------- */

const artMarquee = document.querySelector('[data-art-marquee]');

if (artMarquee) {
    const track = artMarquee.querySelector('.art-marquee__track');
    const group = artMarquee.querySelector('.art-marquee__group');

    if (track && group) {
        /* Duplicate the group so the loop is seamless */
        const clone = group.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
        artMarquee.classList.add('is-ready');
    }
}

/* ---------- Navigation dropdown ---------- */

const navToggle = document.querySelector('.nav__toggle');
const navDropdown = document.querySelector('.nav__dropdown');

if (navToggle && navDropdown) {
    const setDropdownOpen = (open) => {
        navToggle.setAttribute('aria-expanded', String(open));
        navDropdown.hidden = !open;
    };

    navToggle.addEventListener('click', () => {
        setDropdownOpen(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('click', (event) => {
        if (navDropdown.hidden) return;
        if (navDropdown.contains(event.target) || navToggle.contains(event.target)) return;
        setDropdownOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !navDropdown.hidden) {
            setDropdownOpen(false);
            navToggle.focus();
        }
    });
}

/* ---------- Current projects carousel ---------- */

const carousel = document.querySelector('[data-carousel]');

if (carousel) {
    const track = carousel.querySelector('[data-carousel-track]');
    const slides = Array.from(track.children);
    const prevButton = carousel.querySelector('[data-carousel-prev]');
    const nextButton = carousel.querySelector('[data-carousel-next]');
    const VISIBLE_COUNT = 3;

    let index = 0;
    let step = 0;
    let animating = false;

    /* Clone the first three slides so the loop can wrap seamlessly */
    slides.slice(0, VISIBLE_COUNT).forEach((slide) => {
        const clone = slide.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('a, button').forEach((control) => {
            control.tabIndex = -1;
        });
        track.appendChild(clone);
    });

    const translate = (position) => `translate3d(${-position * step}px, 0, 0)`;

    const moveTo = (position, animate) => {
        if (!animate) {
            track.style.transition = 'none';
            track.style.transform = translate(position);
            void track.offsetWidth;
            index = position;
            return;
        }

        /* Commit the starting position before animating to the next one */
        track.style.transition = 'none';
        track.style.transform = translate(index);
        void track.offsetWidth;
        track.style.transition = 'transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)';
        track.style.transform = translate(position);
        index = position;
    };

    const measure = () => {
        if (slides.length < 2) return;
        step = slides[1].offsetLeft - slides[0].offsetLeft;
        animating = false;
        moveTo(Math.min(index, slides.length - 1), false);
    };

    const finishMove = () => {
        animating = false;

        /* We landed on the cloned set - jump back to the real first slide */
        if (index === slides.length) {
            moveTo(0, false);
        }
    };

    track.addEventListener('transitionend', (event) => {
        if (event.propertyName === 'transform') finishMove();
    });

    nextButton.addEventListener('click', () => {
        if (animating) return;
        animating = true;
        moveTo(index + 1, true);
    });

    prevButton.addEventListener('click', () => {
        if (animating) return;
        animating = true;

        if (index === 0) {
            /* Jump to the clone set, then slide back into the real last view */
            moveTo(slides.length, false);
            requestAnimationFrame(() => moveTo(slides.length - 1, true));
        } else {
            moveTo(index - 1, true);
        }
    });

    window.addEventListener('resize', measure);
    measure();
}

/* ---------- Contact icons ---------- */

const contactGrid = document.querySelector('[data-contacts]');

if (contactGrid) {
    contactGrid.addEventListener('click', (event) => {
        const icon = event.target.closest('[data-contact]');
        if (!icon) return;
        alert(`${icon.dataset.contact} link opened`);
    });
}

/* ---------- Interest topics sidebar ---------- */

const interests = document.querySelector('[data-interests]');

if (interests) {
    const buttons = Array.from(interests.querySelectorAll('[data-interest]'));
    const output = interests.querySelector('[data-interest-output]');
    const panels = Array.from(interests.querySelectorAll('[data-interest-panel]'));

    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            buttons.forEach((item) => {
                item.setAttribute('aria-pressed', String(item === button));
            });

            if (output) {
                output.hidden = true;
            }

            panels.forEach((panel) => {
                panel.hidden = panel.dataset.interestPanel !== button.dataset.interest;
            });
        });
    });
}
