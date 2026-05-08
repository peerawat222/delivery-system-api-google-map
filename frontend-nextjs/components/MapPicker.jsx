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
    script.onerror = () => reject(new Error("โหลด Google Maps ไม่สำเร็จ"));
    document.head.appendChild(script);
  });
}

export default function MapPicker({
  defaultCenter = { lat: 13.7563, lng: 100.5018 },
  zoom = 12,
  height = 400,
  onChange,
  activePin,
  onActivePinChange,
  initialPickup = null,
  swapTrigger = 0,
  swapPickup = null,
  swapDropoff = null,
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const dropMarkerRef = useRef(null);
  const infoWindowRef = useRef(null);
  const polylineRef = useRef(null);
  const mapsRef = useRef(null);
  const modeRef = useRef("pickup");
  const geocoderRef = useRef(null);
  const drawRouteAndEmitRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onActivePinChangeRef = useRef(onActivePinChange);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onActivePinChangeRef.current = onActivePinChange; }, [onActivePinChange]);

  const [mode, setMode] = useState(activePin || "pickup");
  const [status, setStatus] = useState("กำลังโหลดแผนที่...");

  useEffect(() => {
    if (activePin) setMode(activePin);
  }, [activePin]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setStatus("กรุณาตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ในไฟล์ .env.local");
      return;
    }

    let map;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        mapsRef.current = maps;

        map = new maps.Map(mapRef.current, {
          center: defaultCenter,
          zoom,
          streetViewControl: false,
          mapTypeControl: false,
          draggableCursor: "crosshair",
        });

        mapInstanceRef.current = map;
        setStatus("คลิกเพื่อวางหมุด");

        const geocoder = new maps.Geocoder();
        geocoderRef.current = geocoder;
        const directionsService = new maps.DirectionsService();

        const reverseGeocode = (pos) =>
          new Promise((resolve) => {
            geocoder.geocode({ location: pos }, (results, geocodeStatus) => {
              if (geocodeStatus === "OK" && results?.[0]) {
                resolve(results[0].formatted_address);
              } else {
                resolve("");
              }
            });
          });

        const drawRouteAndEmit = async () => {
          const pickupMarker = pickupMarkerRef.current;
          const dropMarker = dropMarkerRef.current;

          const pickupPos = pickupMarker
            ? { lat: pickupMarker.getPosition().lat(), lng: pickupMarker.getPosition().lng() }
            : null;
          const dropPos = dropMarker
            ? { lat: dropMarker.getPosition().lat(), lng: dropMarker.getPosition().lng() }
            : null;

          const [pickupAddress, dropoffAddress] = await Promise.all([
            pickupPos ? reverseGeocode(pickupPos) : "",
            dropPos ? reverseGeocode(dropPos) : "",
          ]);

          if (!pickupPos || !dropPos) {
            onChangeRef.current?.({ pickup: pickupPos, dropoff: dropPos, pickupAddress, dropoffAddress, routeKm: null, durationText: "", durationValue: null });
            return;
          }

          directionsService.route(
            { origin: pickupMarker.getPosition(), destination: dropMarker.getPosition(), travelMode: "DRIVING" },
            (result, routeStatus) => {
              if (routeStatus !== "OK" || !result) {
                onChangeRef.current?.({ pickup: pickupPos, dropoff: dropPos, pickupAddress, dropoffAddress, routeKm: null, durationText: "", durationValue: null });
                return;
              }

              if (polylineRef.current) polylineRef.current.setMap(null);

              polylineRef.current = new maps.Polyline({
                path: result.routes[0].overview_path,
                strokeColor: "#2563eb",
                strokeOpacity: 1,
                strokeWeight: 5,
              });
              polylineRef.current.setMap(map);

              const leg = result.routes?.[0]?.legs?.[0];
              const routeKm = leg?.distance?.value ? Number((leg.distance.value / 1000).toFixed(2)) : null;
              const durationText = leg?.duration?.text || "";
              const durationValue = leg?.duration?.value ?? null;

              onChangeRef.current?.({ pickup: pickupPos, dropoff: dropPos, pickupAddress, dropoffAddress, routeKm, durationText, durationValue });
            }
          );
        };

        drawRouteAndEmitRef.current = drawRouteAndEmit;

        const openInfoWindow = (marker, isPickup) => {
          if (!infoWindowRef.current) infoWindowRef.current = new maps.InfoWindow();
          const p = marker.getPosition();
          infoWindowRef.current.setContent(`
            <div style="min-width:220px;font-family:Arial,sans-serif;padding:0;overflow:hidden;border-radius:14px;">
              <div style="background:${isPickup ? "#16a34a" : "#ef4444"};color:white;padding:10px 14px;font-size:15px;font-weight:700;">
                ${isPickup ? "🟢 จุดรับสินค้า" : "🔴 จุดส่งสินค้า"}
              </div>
              <div style="padding:12px 14px;background:white;">
                <div style="font-size:14px;font-weight:700;color:#111827;">${p.lat().toFixed(5)}, ${p.lng().toFixed(5)}</div>
              </div>
            </div>
          `);
          infoWindowRef.current.open(map, marker);
        };

        setMapReady(true);

        map.addListener("click", async (evt) => {
          const pos = { lat: evt.latLng.lat(), lng: evt.latLng.lng() };
          const isPickup = modeRef.current === "pickup";
          const markerRef = isPickup ? pickupMarkerRef : dropMarkerRef;

          const icon = {
            url: isPickup
              ? "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
              : "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
            scaledSize: new maps.Size(46, 46),
          };

          if (!markerRef.current) {
            markerRef.current = new maps.Marker({ position: pos, map, icon, animation: maps.Animation.BOUNCE });
            setTimeout(() => markerRef.current?.setAnimation(null), 1400);
            markerRef.current.addListener("click", () => openInfoWindow(markerRef.current, isPickup));
          } else {
            markerRef.current.setPosition(pos);
            markerRef.current.setIcon(icon);
            markerRef.current.setAnimation(maps.Animation.BOUNCE);
            setTimeout(() => markerRef.current?.setAnimation(null), 1200);
          }

          openInfoWindow(markerRef.current, isPickup);
          setStatus(`${isPickup ? "จุดรับ" : "จุดส่ง"}: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
          onActivePinChangeRef.current?.(isPickup ? "pickup" : "dropoff");
          await drawRouteAndEmit();
        });
      })
      .catch((err) => {
        console.error(err);
        setStatus(err.message || "โหลดแผนที่ไม่สำเร็จ");
      });

    return () => {
      if (map && mapsRef.current) mapsRef.current.event.clearInstanceListeners(map);
      if (polylineRef.current) polylineRef.current.setMap(null);
    };
  }, [defaultCenter.lat, defaultCenter.lng, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!swapTrigger || !mapReady || !mapInstanceRef.current || !mapsRef.current) return;

    const maps = mapsRef.current;
    const map = mapInstanceRef.current;

    const placeOrMove = (markerRef, pos, iconUrl) => {
      if (!pos) {
        if (markerRef.current) { markerRef.current.setMap(null); markerRef.current = null; }
        return;
      }
      const icon = { url: iconUrl, scaledSize: new maps.Size(46, 46) };
      if (markerRef.current) {
        markerRef.current.setPosition(pos);
        markerRef.current.setIcon(icon);
        markerRef.current.setAnimation(maps.Animation.BOUNCE);
        setTimeout(() => markerRef.current?.setAnimation(null), 1000);
      } else {
        markerRef.current = new maps.Marker({ position: pos, map, icon, animation: maps.Animation.BOUNCE });
        setTimeout(() => markerRef.current?.setAnimation(null), 1000);
      }
    };

    placeOrMove(pickupMarkerRef, swapPickup, "http://maps.google.com/mapfiles/ms/icons/green-dot.png");
    placeOrMove(dropMarkerRef, swapDropoff, "http://maps.google.com/mapfiles/ms/icons/red-dot.png");

    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }

    drawRouteAndEmitRef.current?.();
    setStatus("🔄 สลับจุดรับ-ส่งแล้ว");
  }, [swapTrigger, swapPickup, swapDropoff, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialPickup || !mapReady || !mapInstanceRef.current || !mapsRef.current) return;

    const maps = mapsRef.current;
    const map = mapInstanceRef.current;

    map.panTo(initialPickup);
    map.setZoom(15);

    const icon = {
      url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
      scaledSize: new maps.Size(46, 46),
    };

    if (!pickupMarkerRef.current) {
      pickupMarkerRef.current = new maps.Marker({ position: initialPickup, map, icon, animation: maps.Animation.BOUNCE });
      setTimeout(() => pickupMarkerRef.current?.setAnimation(null), 1400);
    } else {
      pickupMarkerRef.current.setPosition(initialPickup);
      pickupMarkerRef.current.setIcon(icon);
    }

    const emitPickup = (address) => {
      onChangeRef.current?.({
        pickup: initialPickup, dropoff: null,
        pickupAddress: address, dropoffAddress: "",
        routeKm: null, durationText: "", durationValue: null,
      });
    };

    if (geocoderRef.current) {
      geocoderRef.current.geocode({ location: initialPickup }, (results, gStatus) => {
        emitPickup(gStatus === "OK" && results?.[0] ? results[0].formatted_address : "");
      });
    } else {
      emitPickup("");
    }

    setMode("dropoff");
    modeRef.current = "dropoff";
    onActivePinChangeRef.current?.("dropoff");
    setStatus("📍 ตำแหน่งปัจจุบัน (จุดรับ) • คลิกเพื่อวางจุดส่ง");
  }, [initialPickup, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div style={{ marginBottom: 10, display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={() => { setMode("pickup"); onActivePinChange?.("pickup"); }}
          style={{ padding: "8px 14px", borderRadius: 10, border: mode === "pickup" ? "2px solid #16a34a" : "1px solid #d1d5db", background: mode === "pickup" ? "#dcfce7" : "white", fontWeight: 700, cursor: "pointer" }}
        >
          🟢 จุดรับ
        </button>
        <button
          type="button"
          onClick={() => { setMode("dropoff"); onActivePinChange?.("dropoff"); }}
          style={{ padding: "8px 14px", borderRadius: 10, border: mode === "dropoff" ? "2px solid #ef4444" : "1px solid #d1d5db", background: mode === "dropoff" ? "#fee2e2" : "white", fontWeight: 700, cursor: "pointer" }}
        >
          🔴 จุดส่ง
        </button>
      </div>

      <div ref={mapRef} style={{ width: "100%", height, borderRadius: 16, overflow: "hidden" }} />
      <p style={{ marginTop: 10 }}>{status}</p>
    </div>
  );
}
