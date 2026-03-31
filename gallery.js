const menuItems = Array.from(document.querySelectorAll(".gallery-menu-item"));
const previewImage = document.getElementById("galleryPreviewImage");
const previewTitle = document.getElementById("galleryPreviewTitle");
const previewFormat = document.getElementById("galleryPreviewFormat");
const previewGroup = document.getElementById("galleryPreviewGroup");
const previewLink = document.getElementById("galleryPreviewLink");

function updatePreview(item) {
  const {
    imageSrc,
    imageAlt,
    imageTitle,
    imageFormat,
    imageGroup,
    imageLink,
  } = item.dataset;

  previewImage.src = imageSrc;
  previewImage.alt = imageAlt;
  previewTitle.textContent = imageTitle;
  previewFormat.textContent = imageFormat;
  previewGroup.textContent = imageGroup;
  previewLink.href = imageLink;

  menuItems.forEach((button) => {
    button.classList.toggle("is-active", button === item);
  });
}

menuItems.forEach((item) => {
  item.addEventListener("click", () => updatePreview(item));
});
