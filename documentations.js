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

function showEmptyPreview(message = "Choisis un document dans le menu de gauche pour afficher son aperçu dans cet espace.") {
  previewGroup.setAttribute("hidden", "hidden");
  previewLink.setAttribute("hidden", "hidden");
  previewNote.setAttribute("hidden", "hidden");
  previewEmpty.hidden = false;
  previewPanel?.classList.add("is-empty");

  const emptyText = previewEmpty?.querySelector(".gallery-preview-empty-text");
  if (emptyText) {
    emptyText.textContent = message;
  }
}

function updatePreview(item) {
  const {
    imageSrc,
    imageAlt,
    imageGroup,
    imageGroupKey,
    imageLink,
    imageNote,
  } = item.dataset;

  previewImage.removeAttribute("src");
  previewImage.alt = imageAlt;
  previewGroup.textContent = imageGroup;
  previewGroup.removeAttribute("hidden");
  previewLink.href = imageLink;
  previewLink.removeAttribute("hidden");
  previewEmpty.hidden = true;
  previewPanel?.classList.remove("is-empty");
  previewGroup.classList.remove(
    "gallery-section-tag-presidence",
    "gallery-section-tag-mandatory",
    "gallery-section-tag-government"
  );
  previewGroup.classList.add(groupClassByKey[imageGroupKey] ?? "gallery-section-tag-presidence");
  previewNote.textContent = imageNote ?? "";
  if (imageNote) {
    previewNote.removeAttribute("hidden");
  } else {
    previewNote.setAttribute("hidden", "hidden");
  }
  previewImage.src = imageSrc;

  menuItems.forEach((button) => {
    button.classList.toggle("is-active", button === item);
  });
}

previewImage.addEventListener("error", () => {
  showEmptyPreview("Impossible de charger l'image sélectionnée. Vérifie que le fichier est bien présent sur l'hébergement.");
});

menuItems.forEach((item) => {
  item.addEventListener("click", () => updatePreview(item));
});
