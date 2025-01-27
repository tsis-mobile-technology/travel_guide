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

// Google Maps 초기화
async function initMap() {
    // 필요한 라이브러리들을 로드
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");

    map = new Map(document.getElementById("map"), {
        center: { lat: 37.5665, lng: 126.978 },
        zoom: 13,
        mapId: 'google_map_id_here'  // Google Cloud Console에서 생성한 Map ID
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

// 위치 추적 에러 처리
function handleLocationError(error) {
    console.error("위치 추적 에러:", error);
    switch(error.code) {
        case error.PERMISSION_DENIED:
            alert("위치 추적 권한이 거부되었습니다.");
            break;
        case error.POSITION_UNAVAILABLE:
            alert("위치 정보를 사용할 수 없습니다.");
            break;
        case error.TIMEOUT:
            alert("위치 정보 요청이 시간 초과되었습니다.");
            break;
        default:
            alert("알 수 없는 오류가 발생했습니다.");
            break;
    }
}

// 경로 계산 및 표시 함수 개선
async function calculateAndDisplayRoute(destination) {
    if (!currentLocationMarker) {
        alert("현재 위치를 확인할 수 없습니다.");
        return;
    }

    // 출발지와 목적지 좌표 확인 로깅
    console.log('출발지:', currentLocationMarker.position);
    console.log('목적지:', destination);

    const request = {
        origin: currentLocationMarker.position,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING,
        // 대체 경로도 검색
        provideRouteAlternatives: true,
        // 경로 제한 완화
        unitSystem: google.maps.UnitSystem.METRIC,
        // 웨이포인트 최적화
        optimizeWaypoints: true
    };

    try {
        // 먼저 직선 거리 계산
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(currentLocationMarker.position.lat, currentLocationMarker.position.lng),
            new google.maps.LatLng(destination.lat, destination.lng)
        );

        // 직선 거리가 너무 가깝거나 먼 경우 처리
        if (distance < 10) { // 10미터 미만
            infoWindow.setContent(
                `<div style="padding: 10px;">
                    <h3>목적지가 너무 가깝습니다</h3>
                    <p>현재 위치와 목적지가 거의 동일합니다.</p>
                </div>`
            );
            infoWindow.setPosition(destination);
            infoWindow.open(map);
            return;
        }

        const result = await directionsService.route(request);
        directionsRenderer.setDirections(result);
        
        // 경로 정보 표시
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
        infoWindow.setPosition(destination);
        infoWindow.open(map);

        // 경로가 표시된 영역으로 지도 이동
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(currentLocationMarker.position);
        bounds.extend(destination);
        map.fitBounds(bounds);

    } catch (error) {
        console.error("경로 계산 에러:", error);
        
        // 오류 종류에 따른 다른 메시지 표시
        let errorMessage = "경로를 계산할 수 없습니다.";
        if (error.code === "ZERO_RESULTS") {
            errorMessage = "경로를 찾을 수 없습니다. 다른 이동 수단을 시도해보세요.";
            
            // 직선 거리와 방향 표시
            const directLine = new google.maps.Polyline({
                path: [
                    currentLocationMarker.position,
                    destination
                ],
                geodesic: true,
                strokeColor: '#FF0000',
                strokeOpacity: 0.5,
                strokeWeight: 2,
                map: map
            });

            // 5초 후 직선 제거
            setTimeout(() => {
                directLine.setMap(null);
            }, 5000);
        } else if (error.code === "OVER_QUERY_LIMIT") {
            errorMessage = "잠시 후 다시 시도해주세요.";
        }

        // 오류 메시지를 InfoWindow로 표시
        infoWindow.setContent(
            `<div style="padding: 10px;">
                <h3>경로 안내 불가</h3>
                <p>${errorMessage}</p>
            </div>`
        );
        infoWindow.setPosition(destination);
        infoWindow.open(map);
    }
}


// 이동 수단 변경 함수 개선
function changeTravelMode(mode) {
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
        listItem.textContent = place.name;
        listItem.dataset.placeId = place.place_id;
        
        // 클릭 시 경로 계산
        listItem.addEventListener("click", () => {
            const destination = { lat: place.latitude, lng: place.longitude };
            calculateAndDisplayRoute(destination);
            map.panTo(destination);
            map.setZoom(15);
        });
        
        // 이동 수단 선택 버튼 추가
        const transportModes = document.createElement("div");
        transportModes.className = "transport-modes";
        
        const modes = [
            { icon: "🚗", mode: google.maps.TravelMode.DRIVING },
            { icon: "🚶", mode: google.maps.TravelMode.WALKING },
            { icon: "🚲", mode: google.maps.TravelMode.BICYCLING },
            { icon: "🚌", mode: google.maps.TravelMode.TRANSIT }
        ];
        
        modes.forEach(({ icon, mode }) => {
            const button = document.createElement("button");
            button.textContent = icon;
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                changeTravelMode(mode);
            });
            transportModes.appendChild(button);
        });
        
        listItem.appendChild(transportModes);
        
        // Delete 버튼
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.classList.add("delete-button");
        deleteButton.addEventListener("click", async (event) => {
            event.stopPropagation();
            await removePlace(place.place_id);
            placesList.delete(placeKey);
            listItem.remove();
            removeMarkerByPosition(place.latitude, place.longitude);
            // 경로가 표시되어 있다면 제거
            directionsRenderer.setDirections({ routes: [] });
        });
        
        listItem.appendChild(deleteButton);
        
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
    const response = await fetch(`/remove_place/${placeId}`, {
        method: "DELETE",
    });

    if (!response.ok) {
        console.error("Error removing place:", response.status);
        alert("Failed to remove place. Please try again.");
    }
}

// 이벤트 리스너 설정
document.getElementById("login-button").addEventListener("click", () => {
    window.location.href = "/login";
});

document.getElementById('logout-button').addEventListener('click', () => {
    window.location.href = '/logout';
});

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', cleanup);

// 초기화
window.initMap = initMap;

// window.onload 수정
window.onload = async () => {
    console.log('Window loaded');
    await fetchUserInfo();
    await initMap(); // fetchStarredPlaces는 initMap 내에서 호출됨
};