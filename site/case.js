document.querySelectorAll(".reveal").forEach((element) => {
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      observer.disconnect();
    },
    { threshold: 0.1 }
  );
  observer.observe(element);
});

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});
