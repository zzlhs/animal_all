# GBIF Photo Globe

A Vue component implementation of the reference Photo Globe experience, backed by the supplied GBIF occurrence sample.

## Architecture

- Vue 3 single-file components
- `MapProvider` abstraction with Mapbox GL and MapLibre GL providers
- dedicated `PhotoPin`, `ClusterPin`, `OccurrenceCard`, `MapControls`, and `FilterPanel` components
- geographic clustering that follows the reference zoom threshold and averaged cluster coordinates
- English-first map labels
- Mapbox Standard night/day presentation when a Mapbox public token is configured
- OpenFreeMap compatibility mode when no token is available

## Development

```bash
npm install
npm run dev
```

Open http://localhost:5173.

For the exact Mapbox Standard basemap used by the reference, copy `.env.example` to `.env` and set your own public token:

```bash
VITE_MAPBOX_ACCESS_TOKEN=pk.your_public_token
```

The project does not copy or reuse the reference website's access token.

## Production

```bash
npm run build
npm start
```

The production server listens on port 3000 by default. Set `PORT` to override it.

## Data

`public/data/occurrences.json` contains 100 GBIF records. The 94 records with coordinates are plotted. Marker images are loaded lazily from the public GBIF occurrence API when media is available.
