let tasks = [];
let map, locationMap, mainMapCurrentLocationMarker;
let taskMarkers = [];
let selectedLocation = null;
let userCurrentLocation = null;
let geocoder;
let selectedMarker = null;

function initializeMainMap() {
    map = L.map('map').setView([51.505, -0.09], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            userCurrentLocation = { lat, lng };

            if (!mainMapCurrentLocationMarker) {
                mainMapCurrentLocationMarker = L.marker([lat, lng], {
                    icon: L.icon({
                        iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41]
                    })
                }).addTo(map).bindPopup("You are here");
            }
            map.setView([lat, lng], 13);

            // Trigger notification check after location is loaded
            notifyNearbyTasks();
        });
    }
}

function initializeLocationMap() {
    locationMap = L.map('locationMap').setView([51.505, -0.09], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(locationMap);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            userCurrentLocation = { lat, lng };
            locationMap.setView([lat, lng], 13);

            L.marker([lat, lng]).addTo(locationMap)
                .bindPopup("Your current location").openPopup();
        });
    }

    geocoder = L.Control.Geocoder.nominatim();
    const searchControl = L.Control.geocoder({
        placeholder: 'Search for a place...',
        errorMessage: 'Location not found',
    }).on('markgeocode', function (e) {
        const latLng = e.geocode.center;
        selectedLocation = latLng;
        locationMap.setView(latLng, 13);
        document.getElementById('chosenLocation').innerText = `Chosen Location: ${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)}`;
        if (selectedMarker) locationMap.removeLayer(selectedMarker);
        selectedMarker = L.marker(latLng).addTo(locationMap);
    }).addTo(locationMap);

    locationMap.on('click', function (e) {
        selectedLocation = e.latlng;
        document.getElementById('chosenLocation').innerText = `Chosen Location: ${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`;
        if (selectedMarker) locationMap.removeLayer(selectedMarker);
        selectedMarker = L.marker(selectedLocation).addTo(locationMap);
    });
}

document.getElementById('addLocationCheckbox').addEventListener('change', function () {
    const locationMapContainer = document.getElementById('locationMapContainer');
    if (this.checked) {
        locationMapContainer.style.display = 'block';
        if (!locationMap) initializeLocationMap();
    } else {
        locationMapContainer.style.display = 'none';
        if (selectedMarker) {
            locationMap.removeLayer(selectedMarker);
            selectedMarker = null;
        }
    }
});

document.getElementById('addTaskBtn').addEventListener('click', function () {
    const taskInput = document.getElementById('taskInput');
    const taskDescription = document.getElementById('taskDescription').value.trim();

    if (taskInput.value.trim() && taskDescription) {
        const task = { description: taskInput.value, details: taskDescription, location: selectedLocation, completed: false };
        tasks.push(task);
        taskInput.value = '';
        document.getElementById('taskDescription').value = '';
        selectedLocation = null;
        document.getElementById('chosenLocation').innerText = 'No location chosen';
        updateTaskList();
        updateMapMarkers();

        if (selectedMarker) locationMap.removeLayer(selectedMarker);
        map.invalidateSize();

        // Check for nearby tasks after adding a new one
        notifyNearbyTasks();
    } else alert('Please enter task description and details.');
});

function updateTaskList() {
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '';
    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <strong>${index + 1}. ${task.description}</strong><br/>
            <small>${task.details}</small><br/>
            <input type="checkbox" class="task-completion" data-index="${index}" ${task.completed ? 'checked' : ''}>
            <span>${task.completed ? '(Completed)' : ''}</span>
        `;
        if (task.location) {
            li.innerHTML += `<br/><em>Location: ${task.location.lat.toFixed(4)}, ${task.location.lng.toFixed(4)}</em>`;
        }
        taskList.appendChild(li);
    });

    // Add event listeners to checkboxes
    document.querySelectorAll('.task-completion').forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const taskIndex = this.getAttribute('data-index');
            tasks[taskIndex].completed = this.checked;
            updateTaskList();
            updateMapMarkers();

            // Check for nearby tasks after marking a task as completed or not
            notifyNearbyTasks();
        });
    });
}

function updateMapMarkers() {
    if (taskMarkers.length) taskMarkers.forEach(marker => map.removeLayer(marker));
    const tasksWithLocations = tasks.filter(task => task.location && !task.completed);

    if (tasksWithLocations.length) {
        document.getElementById('mapContainer').style.display = 'block';
        tasksWithLocations.forEach((task, index) => {
            const marker = L.marker([task.location.lat, task.location.lng], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div class="marker"><div class="numbered-marker">${index + 1}</div></div>`,
                    iconSize: [35, 50],
                    iconAnchor: [17, 50]
                })
            }).addTo(map).bindPopup(`<strong>${task.description}</strong><br/>${task.details}`);
            taskMarkers.push(marker);
        });
        map.invalidateSize();
    } else document.getElementById('mapContainer').style.display = 'none';
}

function notifyNearbyTasks() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") checkProximityAndNotify();
    else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") checkProximityAndNotify();
        });
    }
}

function checkProximityAndNotify() {
    const radius = 0.0005; // roughly 50 meters
    let notified = false;
    const alertSound = new Audio('ALERT.mp3'); // Adjust the path if necessary

    tasks.forEach(task => {
        if (task.location && userCurrentLocation && !task.completed) {
            const distance = Math.sqrt(
                Math.pow(task.location.lat - userCurrentLocation.lat, 2) +
                Math.pow(task.location.lng - userCurrentLocation.lng, 2)
            );

            if (distance < radius) {
                if (!notified) {
                    new Notification(`Task nearby: ${task.description}`, {
                        body: task.details
                    });
                    alertSound.play(); // Play the alert sound
                    notified = true; // Only notify once per check
                }
            }
        }
    });
}


window.onload = () => {
    initializeMainMap();
    // Check for nearby tasks periodically every 5 minutes (300000 ms)
    setInterval(notifyNearbyTasks, 300000); // Every 5 minutes
};