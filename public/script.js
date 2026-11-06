
const equipmentForm = document.getElementById('equipmentForm');
const equipmentTable = document.getElementById('equipmentTable');
const searchInput = document.getElementById('searchInput');
const formMessage = document.getElementById('formMessage');
const inventoryMessage = document.getElementById('inventoryMessage');
const submitButton = equipmentForm.querySelector('button[type="submit"]');

document.getElementById('todayDate').textContent =
    new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message ${type}`;
}

async function loadEquipment() {
    equipmentTable.innerHTML =
        '<tr><td colspan="6">Loading equipment...</td></tr>';

    try {
        const search = searchInput.value.trim();

        const response = await fetch(
            `/api/equipment?search=${encodeURIComponent(search)}`
        );

        const equipment = await response.json();

        if (!response.ok) {
            throw new Error(equipment.message || 'Unable to load equipment.');
        }

        equipmentTable.replaceChildren();

        if (equipment.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');

            cell.colSpan = 6;
            cell.textContent = 'No equipment found.';
            row.appendChild(cell);
            equipmentTable.appendChild(row);
        }

        equipment.forEach(item => {
            const row = document.createElement('tr');

            const values = [
                item.equipment_id,
                item.name,
                item.category,
                item.quantity,
                item.available_quantity
            ];

            values.forEach(value => {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            });

            const statusCell = document.createElement('td');
            const badge = document.createElement('span');

            const isAvailable = Number(item.available_quantity) > 0;

            badge.className = isAvailable
                ? 'status available'
                : 'status unavailable';

            badge.textContent = isAvailable
                ? 'Available'
                : 'Out of Stock';

            statusCell.appendChild(badge);
            row.appendChild(statusCell);

            equipmentTable.appendChild(row);
        });

        // Update dashboard figures using all equipment records.
        if (!search) {
            document.getElementById('totalTypes').textContent =
                equipment.length;

            document.getElementById('totalUnits').textContent =
                equipment.reduce((sum, item) => sum + Number(item.quantity), 0);

            document.getElementById('availableUnits').textContent =
                equipment.reduce(
                    (sum, item) => sum + Number(item.available_quantity),
                    0
                );

            document.getElementById('issuedUnits').textContent =
                equipment.reduce(
                    (sum, item) =>
                        sum + Number(item.quantity) -
                        Number(item.available_quantity),
                    0
                );
        }

        showMessage(inventoryMessage, '', '');
    } catch (error) {
        equipmentTable.replaceChildren();

        const row = document.createElement('tr');
        const cell = document.createElement('td');

        cell.colSpan = 6;
        cell.textContent = 'Unable to load equipment. Check the server.';
        row.appendChild(cell);
        equipmentTable.appendChild(row);

        showMessage(inventoryMessage, error.message, 'error');
    }
}

equipmentForm.addEventListener('submit', async event => {
    event.preventDefault();

    const name = document.getElementById('name').value.trim();
    const category = document.getElementById('category').value;
    const quantity = Number(document.getElementById('quantity').value);

    if (!name || !category || !Number.isInteger(quantity) || quantity <= 0) {
        showMessage(
            formMessage,
            'Please enter a valid name, category, and quantity.',
            'error'
        );
        return;
    }

    submitButton.disabled = true;
    showMessage(formMessage, 'Adding equipment...', '');

    try {
        const response = await fetch('/api/equipment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, category, quantity })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Unable to add equipment.');
        }

        equipmentForm.reset();
        searchInput.value = '';

        showMessage(formMessage, result.message, 'success');

        await loadEquipment();
    } catch (error) {
        showMessage(formMessage, error.message, 'error');
    } finally {
        submitButton.disabled = false;
    }
});

let searchTimer;

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadEquipment, 250);
});

document.getElementById('refreshBtn').addEventListener('click', () => {
    searchInput.value = '';
    loadEquipment();
});

loadEquipment();
// Sidebar show/hide toggle
const sidebarToggle = document.getElementById('sidebarToggle');

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
        const isHidden = document.body.classList.toggle('sidebar-hidden');

        sidebarToggle.setAttribute(
            'aria-expanded',
            String(!isHidden)
        );

        sidebarToggle.setAttribute(
            'aria-label',
            isHidden ? 'Show sidebar' : 'Hide sidebar'
        );
    });
}