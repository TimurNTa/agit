import assert from "node:assert/strict";
import test from "node:test";
import { buildRouteOrder } from "./route-order.ts";
import { normalizeBounds } from "./osm.ts";

test("route order visits every point once and follows nearby stops", () => {
  const order = buildRouteOrder([
    { id: "far", lat: 57.60, lon: 34.60 },
    { id: "near", lat: 57.5911, lon: 34.5631 },
    { id: "middle", lat: 57.595, lon: 34.57 },
  ], { lat: 57.591, lon: 34.563 });
  assert.deepEqual(order, ["near", "middle", "far"]);
  assert.equal(new Set(order).size, 3);
});

test("map bounds accept a neighbourhood and reject a huge selection", () => {
  assert.ok(normalizeBounds({ south: 57.58, west: 34.54, north: 57.60, east: 34.58 }));
  assert.equal(normalizeBounds({ south: 56, west: 33, north: 59, east: 36 }), null);
});
