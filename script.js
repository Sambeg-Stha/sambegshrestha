document.querySelectorAll('.fade_in').forEach(el => {
    const deg = (Math.random() * 2.4 - 1.2);    
    el.style.setProperty('--tilt', deg + 'deg');
});