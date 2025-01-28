// 전역 변수들을 먼저 선언
let map;
let userInfo = null;
let placesList = new Set(); // 장소 목록을 Set으로 관리
let markers = new Map(); // 마커 관리를 위한 Map 객체
let infoWindow = null; // 정보창을 위한 변수
// 전역 변수 추가
let currentLocationMarker = null;
let directionsService = null;
let directionsRenderer = null;
let watchId = null;
let currentPolyline = null;
// 메뉴 토글 상태 관리
let isMenuVisible = true;

// 메뉴 토글 초기화 함수
function initializeMenuToggle() {
    const menu = document.getElementById('menu');
    const mapContainer = document.getElementById('map');
    
    // 토글 버튼 생성
    const toggleButton = document.createElement('button');
    toggleButton.id = 'toggle-menu';
    toggleButton.innerHTML = '☰';
    document.body.appendChild(toggleButton);  // body에 직접 추가하여 항상 보이도록 함
    
    // 클릭 이벤트 처리
    toggleButton.addEventListener('click', () => {
        isMenuVisible = !isMenuVisible;
        menu.classList.toggle('hidden');
        
        // 버튼 아이콘 변경
        toggleButton.innerHTML = isMenuVisible ? '☰' : '☰';
        
        // 지도 리사이즈 트리거
        setTimeout(() => {
            google.maps.event.trigger(map, 'resize');
            if (markers.size > 0) {
                fitMapToBounds();
            }
        }, 300);
    });
}

// Google Maps 초기화
async function initMap() {
    // 필요한 라이브러리들을 로드
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");

    map = new Map(document.getElementById("map"), {
        center: { lat: 37.5665, lng: 126.978 },
        zoom: 13,
    });

    // Directions 서비스 초기화
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true // 기본 마커 숨기기
    });

    // InfoWindow 초기화
    infoWindow = new google.maps.InfoWindow();
    
    // 현재 위치 추적 시작
    startLocationTracking();

    // 지도 초기화가 완료되면 장소 데이터를 가져옴
    await fetchStarredPlaces();

    map.addListener("click", (event) => {
        const geocoder = new google.maps.Geocoder();
        const latLng = event.latLng;

        geocoder.geocode({ location: latLng }, (results, status) => {
            if (status === "OK") {
                if (results[0]) {
                    const placeData = {
                        name: results[0].formatted_address,
                        address: results[0].formatted_address,
                        latitude: latLng.lat(),
                        longitude: latLng.lng(),
                        google_place_id: results[0].place_id,
                    };
                    addNewPlace(placeData);
                } else {
                    window.alert("No results found");
                }
            } else {
                window.alert("Geocoder failed due to: " + status);
            }
        });
    });
}

// 현재 위치 추적 시작
function startLocationTracking() {
    if (navigator.geolocation) {
        // 위치 추적 옵션
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };

        // 위치 추적 시작
        watchId = navigator.geolocation.watchPosition(
            updateCurrentLocation,
            handleLocationError,
            options
        );
    } else {
        alert("이 브라우저에서는 위치 추적을 지원하지 않습니다.");
    }
}

// 현재 위치 업데이트
async function updateCurrentLocation(position) {
    const currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };

    // 현재 위치 마커 업데이트
    if (!currentLocationMarker) {
        const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
        
        const pin = new PinElement({
            background: "#FF0000", // 빨간색으로 현재 위치 표시
            borderColor: "#FFFFFF",
            glyphColor: "#FFFFFF",
            scale: 1.2
        });

        currentLocationMarker = new AdvancedMarkerElement({
            map,
            position: currentPosition,
            title: "현재 위치",
            content: pin.element
        });
    } else {
        currentLocationMarker.position = currentPosition;
    }
}

// 위치 오류 처리
function handleLocationError(error) {
    let message = '';
    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = '위치 정보 접근 권한이 거부되었습니다.';
            break;
        case error.POSITION_UNAVAILABLE:
            message = '현재 위치를 가져올 수 없습니다.';
            break;
        case error.TIMEOUT:
            message = '위치 정보 요청이 시간 초과되었습니다.';
            break;
        default:
            message = '알 수 없는 오류가 발생했습니다.';
            break;
    }
    alert(message);
}

// 좌표 유효성 검사 함수 추가
function isValidCoordinate(coord) {
    return coord && !isNaN(coord.lat) && !isNaN(coord.lng) &&
           coord.lat >= -90 && coord.lat <= 90 &&
           coord.lng >= -180 && coord.lng <= 180;
}

// 좌표 정규화 함수
function normalizeCoordinate(coord) {
    return {
        lat: parseFloat(coord.lat),
        lng: parseFloat(coord.lng)
    };
}

// 경로 계산 및 표시 함수 수정
async function calculateAndDisplayRoute(destination) {
    // 기존 직선이 있다면 제거
    if (currentPolyline) {
        currentPolyline.setMap(null);
        currentPolyline = null;
    }

    if (!currentLocationMarker) {
        alert("현재 위치를 확인할 수 없습니다.");
        return;
    }

    const origin = normalizeCoordinate(currentLocationMarker.position);
    const dest = normalizeCoordinate(destination);

    if (!isValidCoordinate(origin) || !isValidCoordinate(dest)) {
        console.error("유효하지 않은 좌표:", { origin, destination });
        alert("유효하지 않은 좌표입니다.");
        return;
    }

    const request = {
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(dest.lat, dest.lng),
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
        region: 'KR',
        unitSystem: google.maps.UnitSystem.METRIC
    };

    try {
        // 일단 직선으로 연결
        currentPolyline = new google.maps.Polyline({
            path: [origin, dest],
            geodesic: true,
            strokeColor: '#FF0000',
            strokeOpacity: 0.5,
            strokeWeight: 2,
            map: map
        });

        const result = await directionsService.route(request);
        
        // 경로를 찾았으면 직선 제거
        if (currentPolyline) {
            currentPolyline.setMap(null);
            currentPolyline = null;
        }
        
        directionsRenderer.setDirections(result);
        
        const route = result.routes[0].legs[0];
        infoWindow.setContent(
            `<div style="padding: 10px;">
                <h3>경로 정보</h3>
                <p>총 거리: ${route.distance.text}</p>
                <p>예상 시간: ${route.duration.text}</p>
                <p>시작: ${route.start_address}</p>
                <p>도착: ${route.end_address}</p>
            </div>`
        );
        infoWindow.setPosition(dest);
        infoWindow.open(map);

        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(dest);
        map.fitBounds(bounds);

    } catch (error) {
        console.error("경로 계산 에러:", error);
        
        // 에러 상황에서 직선은 유지
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(origin.lat, origin.lng),
            new google.maps.LatLng(dest.lat, dest.lng)
        );

        infoWindow.setContent(
            `<div style="padding: 10px;">
                <h3>직선 거리 정보</h3>
                <p>직선 거리: ${(distance/1000).toFixed(2)} km</p>
                <p>* 경로 안내를 찾을 수 없어 직선 거리로 표시합니다.</p>
                <p>* 다른 이동 수단을 시도해보세요.</p>
            </div>`
        );
        infoWindow.setPosition(dest);
        infoWindow.open(map);

        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(dest);
        map.fitBounds(bounds);

        // 10초 후 직선 제거
        setTimeout(() => {
            if (currentPolyline) {
                currentPolyline.setMap(null);
                currentPolyline = null;
            }
        }, 10000);
    }
}

// 모든 이동 수단으로 경로 시도
async function tryAllTravelModes(origin, destination) {
    const modes = [
        google.maps.TravelMode.DRIVING,
        google.maps.TravelMode.TRANSIT,
        google.maps.TravelMode.WALKING,
        google.maps.TravelMode.BICYCLING
    ];

    for (const mode of modes) {
        const request = {
            origin: origin,
            destination: destination,
            travelMode: mode,
            region: 'KR'
        };

        try {
            const result = await directionsService.route(request);
            console.log(`${mode} 경로 찾음!`);
            return { mode, result };
        } catch (error) {
            console.log(`${mode} 경로 실패:`, error);
            continue;
        }
    }

    return null;
}

// 이동 수단 변경 함수 개선
function changeTravelMode(mode) {
    // 직선이 있다면 제거
    if (currentPolyline) {
        currentPolyline.setMap(null);
        currentPolyline = null;
    }

    if (!directionsRenderer.getDirections()) {
        return;
    }

    const request = {
        origin: directionsRenderer.getDirections().routes[0].legs[0].start_location,
        destination: directionsRenderer.getDirections().routes[0].legs[0].end_location,
        travelMode: mode,
        provideRouteAlternatives: true,
        unitSystem: google.maps.UnitSystem.METRIC
    };
    
    directionsService.route(request, (result, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(result);
            
            const route = result.routes[0].legs[0];
            infoWindow.setContent(
                `<div style="padding: 10px;">
                    <h3>경로 정보 (${getTravelModeText(mode)})</h3>
                    <p>총 거리: ${route.distance.text}</p>
                    <p>예상 시간: ${route.duration.text}</p>
                    <p>시작: ${route.start_address}</p>
                    <p>도착: ${route.end_address}</p>
                </div>`
            );
        } else {
            let errorMessage = "이 이동 수단으로는 경로를 찾을 수 없습니다.";
            if (status === "ZERO_RESULTS") {
                errorMessage = `${getTravelModeText(mode)}로는 갈 수 없는 경로입니다. 다른 이동 수단을 선택해주세요.`;
            }
            
            infoWindow.setContent(
                `<div style="padding: 10px;">
                    <h3>경로 안내 불가</h3>
                    <p>${errorMessage}</p>
                </div>`
            );
        }
    });
}

// 이동 수단 텍스트 반환
function getTravelModeText(mode) {
    switch(mode) {
        case google.maps.TravelMode.DRIVING:
            return "자동차";
        case google.maps.TravelMode.WALKING:
            return "도보";
        case google.maps.TravelMode.BICYCLING:
            return "자전거";
        case google.maps.TravelMode.TRANSIT:
            return "대중교통";
        default:
            return "알 수 없음";
    }
}

// 장소 목록 항목 수정
function addPlaceToList(place) {
    const placeKey = `${place.latitude},${place.longitude}`;
    
    if (!placesList.has(placeKey)) {
        placesList.add(placeKey);
        
        const listItem = document.createElement("li");
        
        // 장소 이름 추가
        const placeName = document.createElement("div");
        placeName.className = "place-name";
        placeName.textContent = place.name;
        listItem.appendChild(placeName);
        
        // 이동 수단 버튼 컨테이너
        const transportModes = document.createElement("div");
        transportModes.className = "transport-modes";
        
        const modes = [
            { icon: "🚗", mode: google.maps.TravelMode.DRIVING, label: "운전" },
            { icon: "🚶", mode: google.maps.TravelMode.WALKING, label: "도보" },
            { icon: "🚲", mode: google.maps.TravelMode.BICYCLING, label: "자전거" },
            { icon: "🚌", mode: google.maps.TravelMode.TRANSIT, label: "대중교통" }
        ];
        
        modes.forEach(({ icon, mode, label }) => {
            const button = document.createElement("button");
            button.innerHTML = `${icon} <span class="sr-only">${label}</span>`;
            button.title = label;
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                changeTravelMode(mode);
            });
            transportModes.appendChild(button);
        });
        
        listItem.appendChild(transportModes);
        
        // Delete 버튼
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "삭제";
        deleteButton.className = "delete-button";
        deleteButton.addEventListener("click", async (event) => {
            event.stopPropagation();
            await removePlace(place.place_id);
            placesList.delete(placeKey);
            listItem.remove();
            removeMarkerByPosition(place.latitude, place.longitude);
        });
        
        listItem.appendChild(deleteButton);
        
        // 클릭 이벤트 - 지도 이동
        listItem.addEventListener("click", () => {
            const destination = { lat: place.latitude, lng: place.longitude };
            calculateAndDisplayRoute(destination);
            map.panTo(destination);
            map.setZoom(15);
        });
        
        const placesListElement = document.getElementById('places-list');
        if (placesListElement) {
            placesListElement.appendChild(listItem);
        }
    }
}

// 컴포넌트 정리 함수
function cleanup() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
    }
    if (currentLocationMarker) {
        currentLocationMarker.map = null;
    }
    if (directionsRenderer) {
        directionsRenderer.setMap(null);
    }
}

async function addMarker(place) {
    const position = { lat: place.latitude, lng: place.longitude };
    const positionKey = `${position.lat},${position.lng}`;
    
    if (!markers.has(positionKey)) {
        try {
            // AdvancedMarkerElement와 PinElement 로드
            const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
            
            // 커스텀 핀 생성
            const pin = new PinElement({
                background: "#4285F4",
                borderColor: "#FFFFFF",
                glyphColor: "#FFFFFF",
                scale: 1.2
            });

            // AdvancedMarkerElement 생성
            const marker = new AdvancedMarkerElement({
                map,
                position,
                title: place.name,
                content: pin.element
            });
            
            // 마커 클릭 이벤트
            marker.addListener('click', () => {
                const content = `
                    <div style="padding: 10px;">
                        <h3 style="margin: 0 0 5px 0;">${place.name}</h3>
                        <p style="margin: 0;">${place.address}</p>
                    </div>
                `;
                
                infoWindow.setContent(content);
                infoWindow.open(map, marker);
                
                map.panTo(position);
            });
            
            markers.set(positionKey, marker);
        } catch (error) {
            console.error('Error creating marker:', error);
            // 폴백: 기존 Marker 사용
            const marker = new google.maps.Marker({
                position,
                map,
                title: place.name
            });
            markers.set(positionKey, marker);
        }
    }
}

function removeMarkerByPosition(lat, lng) {
    const positionKey = `${lat},${lng}`;
    const marker = markers.get(positionKey);
    if (marker) {
        if (infoWindow) {
            infoWindow.close();
        }
        marker.map = null; // AdvancedMarkerElement는 setMap 대신 map 프로퍼티 사용
        markers.delete(positionKey);
    }
}

function clearPlacesList() {
    // 직선이 있다면 제거
    if (currentPolyline) {
        currentPolyline.setMap(null);
        currentPolyline = null;
    }

    placesList.clear();
    // 모든 마커 제거
    markers.forEach(marker => {
        marker.map = null; // AdvancedMarkerElement는 setMap 대신 map 프로퍼티 사용
    });
    markers.clear();
    if (infoWindow) {
        infoWindow.close();
    }
    
    const placesListElement = document.getElementById('places-list');
    if (placesListElement) {
        placesListElement.innerHTML = '';
    }
}

// 지도의 모든 마커가 보이도록 지도 범위 조정
function fitMapToBounds() {
    if (markers.size > 0) {
        const bounds = new google.maps.LatLngBounds();
        markers.forEach(marker => {
            bounds.extend(marker.position);
        });
        map.fitBounds(bounds);
        
        // 마커가 하나일 경우 적절한 줌 레벨 설정
        if (markers.size === 1) {
            map.setZoom(15);
        }
    }
}

async function fetchStarredPlaces() {
    console.log('Fetching starred places...');
    if (!userInfo) {
        console.log('User not logged in. Places will not be fetched.');
        return;
    }
    
    try {
        const response = await fetch('/places');
        
        if (response.ok) {
            const places = await response.json();
            console.log('Fetched starred places:', places);
            
            clearPlacesList();
            
            if (places && places.length > 0) {
                places.forEach(place => {
                    addMarker(place);
                    addPlaceToList(place);
                });
                
                // 모든 마커가 보이도록 지도 범위 조정
                fitMapToBounds();
            }
        } else {
            console.error('Error fetching starred places:', response.status);
            if (response.status === 401) {
                alert('Please log in to view your starred places.');
            }
        }
    } catch (error) {
        console.error('Error fetching places:', error);
    }
}

async function fetchUserInfo() {
    const response = await fetch('/userinfo');
    if (response.ok) {
        const data = await response.json();
        if (data) {
            userInfo = data;
            updateUserInfoDisplay();
        } else {
            console.error('Error: user info data is empty');
        }
    } else {
        console.error('Error fetching user info:', response.status);
        document.getElementById('login-button').style.display = 'block';
    }
}

function updateUserInfoDisplay() {
    if (userInfo) {
        document.getElementById("user-info").style.display = "flex";
        document.getElementById("user-name").textContent = userInfo.name;

        const userPhoto = document.getElementById("user-photo");
        if (userInfo.profile_image) {
            userPhoto.src = userInfo.profile_image;
        } else {
            userPhoto.src = "/static/default-profile.png";
        }
    }
}

async function addNewPlace(placeData) {
    const response = await fetch('/add_place', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(placeData)
    });

    if (response.ok) {
        const result = await response.json();
        console.log(result.message);
        fetchStarredPlaces();
    } else {
        const error = await response.json();
        console.error('Error adding place:', error);
        alert('Failed to add place. Please try again.');
    }
}

async function removePlace(placeId) {
    // 직선이 있다면 제거
    if (currentPolyline) {
        currentPolyline.setMap(null);
        currentPolyline = null;
    }

    const response = await fetch(`/remove_place/${placeId}`, {
        method: "DELETE",
    });

    if (!response.ok) {
        console.error("Error removing place:", response.status);
        alert("Failed to remove place. Please try again.");
    }
}

// DOM 요소 초기화와 이벤트 리스너 설정을 하나의 함수로 관리
function initializeUI() {
    // 로그인 버튼 이벤트 리스너
    const loginButton = document.getElementById("login-button");
    if (loginButton) {
        loginButton.addEventListener("click", () => {
            window.location.href = "/login";
        });
    }

    // 로그아웃 버튼 이벤트 리스너
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            window.location.href = "/logout";
        });
    }

    // 메뉴 토글 초기화
    initializeMenuToggle();
}

// 현재 위치 버튼 생성 및 초기화
function initializeLocationButton() {
    const mapContainer = document.getElementById('map');
    
    // 현재 위치 버튼 생성
    const locationButton = document.createElement('button');
    locationButton.id = 'current-location-button';
    locationButton.title = '현재 위치로 이동';
    locationButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
    `;
    
    mapContainer.appendChild(locationButton);
    
    // 클릭 이벤트 처리
    locationButton.addEventListener('click', () => {
        locationButton.classList.add('loading');
        getCurrentLocation();
    });
}

// 현재 위치 가져오기
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const currentPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // 지도 이동
                map.panTo(currentPosition);
                map.setZoom(15);
                
                // 현재 위치 마커 업데이트
                updateCurrentLocationMarker(currentPosition);
                
                // 로딩 상태 제거
                document.getElementById('current-location-button').classList.remove('loading');
            },
            (error) => {
                console.error('Error getting location:', error);
                handleLocationError(error);
                document.getElementById('current-location-button').classList.remove('loading');
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        alert('이 브라우저에서는 위치 정보를 사용할 수 없습니다.');
        document.getElementById('current-location-button').classList.remove('loading');
    }
}

// 현재 위치 마커 업데이트
async function updateCurrentLocationMarker(position) {
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
    
    if (currentLocationMarker) {
        currentLocationMarker.map = null;
    }
    
    // 현재 위치 핀 스타일
    const pinElement = new PinElement({
        background: "#4285F4",
        borderColor: "#fff",
        glyphColor: "#fff"
    });

    currentLocationMarker = new AdvancedMarkerElement({
        map,
        position,
        title: "현재 위치",
        content: pinElement.element,
    });
}

// 이벤트 리스너 설정
document.getElementById("login-button").addEventListener("click", () => {
    window.location.href = "/login";
});

document.getElementById('logout-button').addEventListener('click', () => {
    window.location.href = '/logout';
});

// 화면 크기 변경 시 메뉴 위치 조정
window.addEventListener('resize', () => {
    const menu = document.getElementById('menu');
    const toggleButton = document.getElementById('toggle-menu');
    
    // 화면이 특정 크기 이하일 때 메뉴 자동으로 숨기기
    if (window.innerWidth < 768) {
        menu.classList.add('hidden');
        isMenuVisible = false;
    }
});

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', cleanup);

// 초기화
window.initMap = initMap;

// window.onload에 추가
window.onload = async () => {
    console.log('Window loaded');
    initializeUI();
    await fetchUserInfo();
    await initMap();
    initializeLocationButton();  // 현재 위치 버튼 초기화 추가
};