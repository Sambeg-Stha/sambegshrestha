
(function () {
    'use strict';

    var rotators = document.querySelectorAll('.float-card__rot');

    /* max rotation in degrees, both directions */
    var MAX_TILT = 45;

    rotators.forEach(function (rot) {
        /* random angle between -MAX_TILT and +MAX_TILT */
        var angle = (Math.random() * 2 - 1) * MAX_TILT;
        rot.style.transform = 'rotate(' + angle.toFixed(1) + 'deg)';
    });
})();
