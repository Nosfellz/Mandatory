const menuItems = Array.from(document.querySelectorAll(".gallery-menu-item"));
const previewPanel = document.querySelector(".gallery-preview");
const previewImage = document.getElementById("galleryPreviewImage");
const previewGroup = document.getElementById("galleryPreviewGroup");
const previewNote = document.getElementById("galleryPreviewNote");
const previewLink = document.getElementById("galleryPreviewLink");
const previewEmpty = document.getElementById("galleryPreviewEmpty");
const groupClassByKey = {
  presidence: "gallery-section-tag-presidence",
  mandatory: "gallery-section-tag-mandatory",
  government: "gallery-section-tag-government",
};

function updatePreview(item) {
  const {
    imageSrc,
    imageAlt,
    imageGroup,
    imageGroupKey,
    imageLink,
    imageNote,
  } = item.dataset;

  previewImage.src = imageSrc;
  previewImage.alt = imageAlt;
  previewGroup.textContent = imageGroup;
  previewGroup.hidden = false;
  previewLink.href = imageLink;
  previewLink.hidden = false;
  previewEmpty.hidden = true;
  previewPanel?.classList.remove("is-empty");
  previewGroup.classList.remove(
    "gallery-section-tag-presidence",
    "gallery-section-tag-mandatory",
    "gallery-section-tag-government"
  );
  previewGroup.classList.add(groupClassByKey[imageGroupKey] ?? "gallery-section-tag-presidence");
  previewNote.textContent = imageNote ?? "";
  previewNote.hidden = !imageNote;

  menuItems.forEach((button) => {
    button.classList.toggle("is-active", button === item);
  });
}

menuItems.forEach((item) => {
  item.addEventListener("click", () => updatePreview(item));
});
