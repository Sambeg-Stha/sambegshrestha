/* ---------- Floating project window ---------- */

(() => {
    const TRIGGER = '[data-project][href]';
    const CATEGORIES = {
        art: 'Art project',
        engineering: 'Engineering project',
        gamedevelopment: 'Game development project'
    };
    const ALLOWED_CATEGORIES = Object.keys(CATEGORIES);

    let dialog = null;
    let body = null;
    let label = null;
    let lastTrigger = null;
    let request = null;

    /* Keep the loaded page safe before it enters the document */
    const sanitize = (root) => {
        root.querySelectorAll('script, iframe, object, embed').forEach((node) => node.remove());

        root.querySelectorAll('*').forEach((node) => {
            Array.from(node.attributes).forEach((attribute) => {
                const name = attribute.name.toLowerCase();
                const value = attribute.value.trim();

                if (name.startsWith('on')) {
                    node.removeAttribute(attribute.name);
                    return;
                }

                if ((name === 'href' || name === 'src') && /^javascript:/i.test(value)) {
                    node.removeAttribute(attribute.name);
                }
            });
        });

        root.querySelectorAll('a[target="_blank"]').forEach((link) => {
            link.setAttribute('rel', 'noopener noreferrer');
        });

        /* Carry the site's image protection into injected content */
        root.querySelectorAll('img').forEach((image) => {
            image.setAttribute('draggable', 'false');
            image.setAttribute('loading', 'lazy');
            image.setAttribute('decoding', 'async');
        });

        return root;
    };

    const cleanup = () => {
        document.body.classList.remove('has-project-modal');
        body.replaceChildren();
        dialog.className = 'project-modal';
        label.textContent = 'Project';

        if (lastTrigger) {
            lastTrigger.focus({ preventScroll: true });
            lastTrigger = null;
        }
    };

    const closeModal = () => {
        if (request) {
            request.abort();
            request = null;
        }

        if (dialog && dialog.open) dialog.close();

        cleanup();
    };

    const build = () => {
        dialog = document.createElement('dialog');
        dialog.className = 'project-modal';
        dialog.setAttribute('aria-label', 'Project details');

        const bar = document.createElement('div');
        bar.className = 'project-modal__bar';

        label = document.createElement('span');
        label.className = 'project-modal__label';
        label.textContent = 'Project';

        const close = document.createElement('button');
        close.className = 'project-modal__close';
        close.type = 'button';
        close.setAttribute('aria-label', 'Close project');
        close.textContent = '\u00d7';
        close.addEventListener('click', closeModal);

        bar.append(label, close);

        body = document.createElement('div');
        body.className = 'project-modal__body';

        dialog.append(bar, body);
        document.body.append(dialog);

        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) closeModal();
        });

        dialog.addEventListener('close', cleanup);

        dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            closeModal();
        });
    };

    const status = (message, link) => {
        body.replaceChildren();

        const messageNode = document.createElement('p');
        messageNode.className = 'project-modal__status';
        messageNode.textContent = message;

        if (link) {
            const anchor = document.createElement('a');
            anchor.href = link;
            anchor.textContent = 'Open the project page';
            messageNode.append(document.createTextNode(' '), anchor);
        }

        body.append(messageNode);
    };

    const open = async (trigger) => {
        if (!dialog) build();

        lastTrigger = trigger;

        const page = trigger.getAttribute('href');
        const triggerCategory = trigger.dataset.projectCategory || '';
        const closeButton = dialog.querySelector('.project-modal__close');

        /* Only load same-origin project pages into the window */
        let pageUrl;

        try {
            pageUrl = new URL(page, window.location.href);
        } catch (error) {
            return;
        }

        if (pageUrl.origin !== window.location.origin) {
            window.location.href = page;
            return;
        }

        const source = pageUrl.href;

        document.body.classList.add('has-project-modal');
        status('Loading project\u2026');

        if (!dialog.open) {
            if (typeof dialog.showModal !== 'function') {
                window.location.href = source;
                return;
            }

            dialog.showModal();
        }

        if (closeButton) closeButton.focus({ preventScroll: true });

        if (request) request.abort();
        request = new AbortController();

        try {
            const response = await fetch(source, {
                signal: request.signal,
                credentials: 'same-origin'
            });

            if (!response.ok) throw new Error('Project page not found');

            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const content = doc.querySelector('#project-content');

            if (!content) throw new Error('Project content not found');

            sanitize(content);

            const requestedCategory = content.dataset.category || triggerCategory;
            const category = ALLOWED_CATEGORIES.includes(requestedCategory)
                ? requestedCategory
                : 'art';

            dialog.className = `project-modal project-modal--${category}`;
            label.textContent = CATEGORIES[category];

            body.replaceChildren(document.importNode(content, true));
        } catch (error) {
            if (error.name === 'AbortError') return;
            status('Could not load this project.', source);
        }
    };

    document.addEventListener('click', (event) => {
        const trigger = event.target.closest(TRIGGER);
        if (!trigger) return;

        /* Let modified clicks open the page normally */
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        event.preventDefault();
        open(trigger);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!dialog || !dialog.open) return;

        event.preventDefault();
        closeModal();
    });
})();
