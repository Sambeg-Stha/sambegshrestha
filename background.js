/* Background video system
   - Plays a looping video behind the content, fixed to the screen.
   - EASY WAY TO CHANGE THE VIDEO:
       Drop your file in the assets folder and change the name in
       CONFIG.videoSrc below (background.js:14).
*/
(function () {
    'use strict';

    /* >>> EDIT THIS LINE to change the background video <<< */
    var CONFIG = {
        videoSrc: 'assets/background.mp4'
    };

    var video = document.getElementById('bg-video');

    /* Uses the video path from CONFIG above */
    function playBackgroundVideo() {
        video.src = CONFIG.videoSrc;
        video.load();
        video.play();
    }

    /* Autoplay needs the loop+autoplay attributes; resume in case of hiccups */
    var attemptPlay = function () {
        var p = video.play();
        if (p) {
            p.catch(function () { /* autoplay blocked -- user can click the video */ });
        }
    };

    /* Pause when the tab is hidden (saves battery), resume when you return */
    document.addEventListener('visibilitychange', function () {
        document.hidden ? video.pause() : attemptPlay();
    });

    playBackgroundVideo();
})();