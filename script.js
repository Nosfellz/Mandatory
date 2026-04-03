const categories = {
  1: {
    title: "Catégorie 1",
    items: [
      { label: "Rappel à la loi", min: 450, max: 1350 },
      { label: "Infraction aux règles de circulation", min: 500, max: 1500 },
      { label: "Permis ou licence manquant", min: 600, max: 1800 },
      { label: "Dégradation/Destruction de Poubelle", min: 900, max: 2700 },
      { label: "Participation à un événement illégal", min: 900, max: 2700 },
      { label: "Vol", min: 1000, max: 3000 },
      { label: "Trouble à l'ordre public", min: 1000, max: 3000 },
      { label: "Insulte ou outrage", min: 1500, max: 4500 },
      { label: "Commerce illégal", min: 2000, max: 6000 },
      { label: "Intrusion illégale sur propriété privée", min: 2000, max: 6000 }
    ]
  },
  2: {
    title: "Catégorie 2",
    items: [
      { label: "Détention d'objets prohibés", min: 1400, max: 4200 },
      { label: "Extorsion", min: 1500, max: 4500 },
      { label: "Dégradation de bien public et/ou privé", min: 2000, max: 6000 },
      { label: "Refus d'obtempérer", min: 2000, max: 6000 },
      { label: "Vente de stupéfiants", min: 2000, max: 6000 },
      { label: "Braconnage / Cruauté sur animal", min: 2500, max: 7500 },
      { label: "Manquement aux obligations du Serment", min: 2500, max: 7500 },
      { label: "Port d'arme illégal", min: 2500, max: 7500 },
      { label: "Braquage de commerce local", min: 2800, max: 8400 },
      { label: "Atteinte à l'intégrité morale et/ou physique", min: 3000, max: 9000 },
      { label: "Mise en danger d'autrui", min: 3000, max: 9000 },
      { label: "Organisation d'événement illégal", min: 3200, max: 9600 },
      { label: "Intrusion illégale sur propriété publique", min: 5000, max: 15000 },
      { label: "Trafic de stupéfiants", min: 5500, max: 16500 },
      { label: "Vol aggravé", min: 7000, max: 21000 }
    ]
  },
  3: {
    title: "Catégorie 3",
    items: [
      { label: "Divulgations et/ou vol d'informations confidentielles", min: 6000, max: 18000 },
      { label: "Usurpation d'identité et/ou impersonation", min: 6000, max: 18000 },
      { label: "Obstruction à la justice", min: 7000, max: 21000 },
      { label: "Diffamation", min: 7000, max: 21000 },
      { label: "Perturbation au sein d'un tribunal", min: 7000, max: 21000 },
      { label: "Atteinte à l'intégrité morale armée", min: 7500, max: 22500 },
      { label: "Parjure ou faux témoignage", min: 8000, max: 24000 },
      { label: "Détention de matériel militaire et/ou d'armement lourd prohibé", min: 8500, max: 25500 },
      { label: "Tentative de corruption", min: 8500, max: 25500 },
      { label: "Atteinte au bon fonctionnement d'une entreprise", min: 9000, max: 27000 },
      { label: "Menace contre agent public", min: 9000, max: 27000 },
      { label: "Cybercriminalité", min: 12000, max: 36000 },
      { label: "Trafic et/ou contrebande", min: 12000, max: 36000 },
      { label: "Atteinte à l'intégrité physique armée", min: 12000, max: 36000 },
      { label: "Tentative d'enlèvement", min: 12500, max: 37500 },
      { label: "Intrusion et/ou braquage de la plateforme pétrolière", min: 13000, max: 39000 }
    ]
  },
  4: {
    title: "Catégorie 4",
    items: [
      { label: "Corruption ou chantage", min: 17500, max: 52500 },
      { label: "Enlèvement ou prise d'otage", min: 22000, max: 66000 },
      { label: "Attaque à main armée aggravée", min: 22000, max: 66000 },
      { label: "Violation de serment", min: 30000, max: 90000 },
      { label: "Tentative d'homicide", min: 30000, max: 90000 },
      { label: "Perturbation de San Andreas", min: 40000, max: 120000 },
      { label: "Homicide involontaire", min: 50000, max: 150000 },
      { label: "Homicide volontaire", min: 90000, max: 270000 },
      { label: "Mise en péril des infrastructures étatiques", min: 90000, max: 270000 },
      { label: "Mise en péril des représentants étatiques", min: 150000, max: 450000 },
      { label: "Homicide sur représentant étatique", min: 350000, max: 1050000 },
      { label: "Fraude Fiscale", min: 20000, max: 60000 }
    ]
  }
};

function getShortCategoryTitle(categoryId) {
  return 'Cat. ' + categoryId;
}

function formatAmount(amount) {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '$';
}

function renderOffenseCategories() {
  const container = document.getElementById('offense-categories');
  if (!container) {
    return;
  }
  container.innerHTML = '';

  Object.keys(categories).forEach(function (categoryId) {
    const category = categories[categoryId];
    const section = document.createElement('section');
    section.className = 'category-card category-' + categoryId;

    const header = document.createElement('div');
    header.className = 'category-header';
    const title = document.createElement('h3');
    title.textContent = category.title;
    const count = document.createElement('span');
    count.textContent = category.items.length + ' infractions';
    header.appendChild(title);
    header.appendChild(count);

    const list = document.createElement('div');
    list.className = 'checkbox-list';

    category.items.forEach(function (offense, index) {
      const row = document.createElement('div');
      row.className = 'checkbox-row';

      const label = document.createElement('label');
      label.className = 'checkbox-item';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.category = categoryId;
      input.dataset.index = index;
      input.addEventListener('change', updateSelectedSummary);

      const text = document.createElement('span');
      text.className = 'checkbox-label';
      text.textContent = offense.label;

      label.appendChild(input);
      label.appendChild(text);

      const amount = document.createElement('small');
      amount.className = 'checkbox-amount';
      amount.textContent = formatAmount(offense.min) + ' - ' + formatAmount(offense.max);

      row.appendChild(label);
      row.appendChild(amount);
      list.appendChild(row);
    });

    section.appendChild(header);
    section.appendChild(list);
    container.appendChild(section);
  });
}

const offenseSettings = new Map();

function formatPlural(count, singular, plural) {
  return count + ' ' + (count === 1 ? singular : plural);
}

function renderSelectedBreakdown(container, selected) {
  container.innerHTML = '';

  const prefix = document.createElement('span');
  prefix.className = 'result-title-prefix';
  prefix.textContent = formatPlural(selected.length, 'infraction', 'infractions');
  container.appendChild(prefix);

  const separator = document.createElement('span');
  separator.className = 'result-title-separator';
  separator.textContent = '|';
  container.appendChild(separator);

  const countsByCategory = selected.reduce(function (accumulator, entry) {
    const count = accumulator.get(entry.categoryId) || 0;
    accumulator.set(entry.categoryId, count + 1);
    return accumulator;
  }, new Map());

  Object.keys(categories).forEach(function (categoryId) {
    const count = countsByCategory.get(categoryId);
    if (!count) {
      return;
    }

    const chip = document.createElement('span');
    chip.className = 'result-title-chip result-title-chip-' + categoryId;
    chip.textContent = getShortCategoryTitle(categoryId) + ' [' + count + ']';
    container.appendChild(chip);
  });
}

function getSelectedGlobalMultiplier() {
  const select = document.getElementById('global-multiplier-select');
  return select ? Number(select.value) : 1;
}

function resetCalculatorSelections() {
  document.querySelectorAll('#offense-categories input[type="checkbox"]').forEach(function (checkbox) {
    checkbox.checked = false;
  });

  offenseSettings.clear();

  const globalMultiplierSelect = document.getElementById('global-multiplier-select');
  if (globalMultiplierSelect) {
    globalMultiplierSelect.value = '1';
  }

  updateSelectedSummary();
}

function getSelectedOffenses() {
  const selected = [];
  document.querySelectorAll('#offense-categories input[type="checkbox"]:checked').forEach(function (checkbox) {
    const category = categories[checkbox.dataset.category];
    const offense = category && category.items[Number(checkbox.dataset.index)];
    if (offense) {
      const key = checkbox.dataset.category + '-' + checkbox.dataset.index;
      if (!offenseSettings.has(key)) {
        offenseSettings.set(key, {
          include: true,
          amount: offense.min,
          multiplier: 1
        });
      }
      selected.push({
        offense,
        categoryId: checkbox.dataset.category,
        categoryTitle: getShortCategoryTitle(checkbox.dataset.category),
        key,
        settings: offenseSettings.get(key)
      });
    }
  });
  return selected;
}

function updateSelectedSummary() {
  const selected = getSelectedOffenses();
  const resultCard = document.querySelector('.result-card');
  const title = document.getElementById('result-title');
  const minInfo = document.getElementById('result-min-info');
  const maxInfo = document.getElementById('result-max-info');
  const range = document.getElementById('result-range');
  const items = document.getElementById('result-items');
  const globalMultiplier = getSelectedGlobalMultiplier();

  if (selected.length === 0) {
    if (resultCard) {
      resultCard.classList.add('is-empty');
    }
    title.textContent = '';
    minInfo.textContent = '';
    maxInfo.textContent = '';
    range.textContent = '';
    items.innerHTML = '';
    return;
  }

  if (resultCard) {
    resultCard.classList.remove('is-empty');
  }

  let subtotal = 0;
  items.innerHTML = '';

  selected.forEach(function (entry) {
    const minAmount = entry.offense.min;
    const maxAmount = entry.offense.max;
    const settings = entry.settings;
    const amount = settings.amount;
    const included = settings.include;
    const multiplier = settings.multiplier;
    const lineTotal = included ? amount * multiplier : 0;
    if (included) {
      subtotal += lineTotal;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'result-item result-category-' + entry.categoryId;

    const titleRow = document.createElement('div');
    titleRow.className = 'result-item-title';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = included;
    checkbox.dataset.key = entry.key;
    checkbox.id = 'include-' + entry.key;

    const label = document.createElement('label');
    label.setAttribute('for', 'include-' + entry.key);
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'result-item-category-badge';
    categoryBadge.textContent = getShortCategoryTitle(entry.categoryId);

    const offenseText = document.createElement('span');
    offenseText.className = 'result-item-offense';
    offenseText.textContent = entry.offense.label;

    label.appendChild(categoryBadge);
    label.appendChild(offenseText);

    const rangeText = document.createElement('div');
    rangeText.className = 'result-item-meta';
    rangeText.textContent = formatAmount(minAmount) + ' - ' + formatAmount(maxAmount);

    const amountSelect = document.createElement('select');
    amountSelect.className = 'result-amount-select';
    amountSelect.dataset.key = entry.key;
    let currentAmount = minAmount;
    while (currentAmount <= maxAmount) {
      const option = document.createElement('option');
      option.value = currentAmount;
      option.textContent = formatAmount(currentAmount);
      if (currentAmount === amount) {
        option.selected = true;
      }
      amountSelect.appendChild(option);
      currentAmount += 500;
    }
    if ((maxAmount - minAmount) % 500 !== 0 && currentAmount - 500 !== maxAmount) {
      const option = document.createElement('option');
      option.value = maxAmount;
      option.textContent = formatAmount(maxAmount);
      if (amount === maxAmount) {
        option.selected = true;
      }
      amountSelect.appendChild(option);
    }
    amountSelect.disabled = !included;

    const multiplierSelect = document.createElement('select');
    multiplierSelect.className = 'result-multiplier-select';
    multiplierSelect.dataset.key = entry.key;
    [1, 2, 3, 4, 5, 6].forEach(function (value) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value + 'x';
      if (multiplier === value) {
        option.selected = true;
      }
      multiplierSelect.appendChild(option);
    });
    multiplierSelect.disabled = !included;

    checkbox.addEventListener('change', function () {
      const settings = offenseSettings.get(this.dataset.key);
      if (settings) {
        settings.include = this.checked;
      }
      updateSelectedSummary();
    });

    amountSelect.addEventListener('change', function () {
      const settings = offenseSettings.get(this.dataset.key);
      if (settings) {
        settings.amount = Number(this.value);
      }
      updateSelectedSummary();
    });

    multiplierSelect.addEventListener('change', function () {
      const settings = offenseSettings.get(this.dataset.key);
      if (settings) {
        settings.multiplier = Number(this.value);
      }
      updateSelectedSummary();
    });

    titleRow.appendChild(checkbox);
    titleRow.appendChild(label);
    titleRow.appendChild(rangeText);
    titleRow.appendChild(amountSelect);
    titleRow.appendChild(multiplierSelect);

    wrapper.appendChild(titleRow);
    items.appendChild(wrapper);
  });

  const minEstimate = selected.reduce(function (sum, entry) {
    if (!entry.settings.include) {
      return sum;
    }
    return sum + entry.offense.min;
  }, 0);

  const maxEstimate = selected.reduce(function (sum, entry) {
    if (!entry.settings.include) {
      return sum;
    }
    return sum + entry.offense.max;
  }, 0);

  const total = subtotal * globalMultiplier;
  renderSelectedBreakdown(title, selected);
  minInfo.textContent = formatAmount(minEstimate);
  maxInfo.textContent = formatAmount(maxEstimate);
  range.textContent = formatAmount(total);

}

function initFineCalculator() {
  if (!document.getElementById('offense-categories')) {
    return;
  }
  renderOffenseCategories();
  const fineForm = document.querySelector('.fine-form');
  const globalMultiplierSelect = document.getElementById('global-multiplier-select');
  const resetButton = document.getElementById('reset-calculator-button');
  if (fineForm) {
    fineForm.addEventListener('submit', function (event) {
      event.preventDefault();
    });
  }
  if (globalMultiplierSelect) {
    globalMultiplierSelect.addEventListener('change', updateSelectedSummary);
  }
  if (resetButton) {
    resetButton.addEventListener('click', resetCalculatorSelections);
  }
  updateSelectedSummary();
}

window.addEventListener('load', initFineCalculator);
