"use client";
import { useEffect, useRef, useState } from "react";

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  const existing = document.querySelector("script[data-google-maps]");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window.google.maps));
      existing.addEventListener("error", reject);
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("โหลดแผนที่ไม่สำเร็จ"));
    document.head.appendChild(script);
  });
}

export default function RiderMap({ pickup, dropoff, height = 260 }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const polylineRef = useRef(null);
  const [routeInfo, setRouteInfo] = useState(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !dropoff) return;

    let mapsLib;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled) return;
        mapsLib = maps;

        const center = pickup
          ? { lat: (pickup.lat + dropoff.lat) / 2, lng: (pickup.lng + dropoff.lng) / 2 }
          : dropoff;

        if (!mapInstance.current) {
          mapInstance.current = new maps.Map(mapRef.current, {
            center,
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        } else {
          mapInstance.current.setCenter(center);
        }

        const map = mapInstance.current;
        const bounds = new maps.LatLngBounds();

        if (pickup) {
          new maps.Marker({
            position: pickup,
            map,
            icon: { url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png", scaledSize: new maps.Size(40, 40) },
            title: "จุดรับ",
          });
          bounds.extend(pickup);
        }

        new maps.Marker({
          position: dropoff,
          map,
          icon: { url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png", scaledSize: new maps.Size(40, 40) },
          title: "จุดส่ง",
        });
        bounds.extend(dropoff);
        map.fitBounds(bounds, 50);

        if (pickup) {
          const ds = new maps.DirectionsService();
          ds.route(
            { origin: pickup, destination: dropoff, travelMode: "DRIVING" },
            (result, status) => {
              if (cancelled || status !== "OK" || !result) return;
              if (polylineRef.current) polylineRef.current.setMap(null);
              polylineRef.current = new maps.Polyline({
                path: result.routes[0].overview_path,
                strokeColor: "#2563eb",
                strokeOpacity: 0.9,
                strokeWeight: 5,
                map,
              });
              const leg = result.routes[0]?.legs?.[0];
              if (leg) setRouteInfo({ distance: leg.distance?.text || null, duration: leg.duration?.text || null });
            }
          );
        }
      })
      .catch((err) => console.error("RiderMap error:", err));

    return () => {
      cancelled = true;
      if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
    };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);

  if (!dropoff) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div ref={mapRef} style={{ width: "100%", height, borderRadius: 12, overflow: "hidden" }} />
      {routeInfo && (
        <div className="route-info-bar">
          <span>📏 {routeInfo.distance}</span>
          <span>⏱ {routeInfo.duration}</span>
        </div>
      )}
    </div>
  );
}
