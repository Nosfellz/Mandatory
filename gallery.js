const menuItems = Array.from(document.querySelectorAll(".gallery-menu-item"));
const previewImage = document.getElementById("galleryPreviewImage");
const previewGroup = document.getElementById("galleryPreviewGroup");
const previewLink = document.getElementById("galleryPreviewLink");

function updatePreview(item) {
  const {
    imageSrc,
    imageAlt,
    imageGroup,
    imageGroupKey,
    imageLink,
  } = item.dataset;

  previewImage.src = imageSrc;
  previewImage.alt = imageAlt;
  previewGroup.textContent = imageGroup;
  previewLink.href = imageLink;
  previewGroup.classList.remove("gallery-section-tag-presidence", "gallery-section-tag-government");
  previewGroup.classList.add(
    imageGroupKey === "government" ? "gallery-section-tag-government" : "gallery-section-tag-presidence"
  );

  menuItems.forEach((button) => {
    button.classList.toggle("is-active", button === item);
  });
}

menuItems.forEach((item) => {
  item.addEventListener("click", () => updatePreview(item));
});
