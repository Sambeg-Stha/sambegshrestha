window.addEventListener('load', ()=>{
    window.scrollTo({top:0, behavior: 'instant'});
});

const obveser = new IntersectionObserver((entries) => {
    entries.forEach(entry =>{
        if(entry.isIntersecting){
            entry.target.classList.add('is_visible');
            obveser.unobserve(entry.target);
        }
    });
}, {threshold: 0.2});

document.querySelectorAll('.page').forEach(page => obveser.observe(page));