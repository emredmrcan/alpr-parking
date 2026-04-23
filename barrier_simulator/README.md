# Barrier Simulator

Local multi-barrier hardware simulator for end-to-end testing without physical relay/IP controller.

## Run

From project root:

```bash
python -m barrier_simulator.app
```

Service starts on:

- UI: `http://localhost:8181/`
- OpenAPI docs: `http://localhost:8181/docs`

## Endpoints

- `POST /open/{id}?open_seconds=10.0&policy=ignore`
- `GET /open/{id}?open_seconds=10.0&policy=ignore` (compatibility)
- `GET /barrier/{id}`
- `GET /barriers`
- `POST /close/{id}`
- `GET /faults/{id}`
- `PUT /faults/{id}`
- `GET /health`

## Reentry Policies

- `ignore` (default): if already open, rejects new request as busy.
- `queue_one`: if already open, accepts one extra request and runs one extra 2s cycle.
- `extend`: if already open, extends current open window by `open_seconds`.

## Fault Injection Scenarios

Per barrier (`PUT /faults/{id}`), you can configure:

- `fixed_delay_ms`: always delay responses (simulate slow controller/network).
- `jitter_ms`: random extra delay (simulate unstable network).
- `fail_rate_percent`: random failure ratio for open commands.
- `failure_mode`:
  - `http_500`: immediate failure
  - `timeout_504`: waits `timeout_ms` then fails (timeout simulation)
- `stuck_open`: barrier stays open until `POST /close/{id}` or faults are cleared.

Example:

```bash
curl -X PUT "http://localhost:8181/faults/1" \
  -H "Content-Type: application/json" \
  -d '{
    "fixed_delay_ms": 400,
    "jitter_ms": 800,
    "fail_rate_percent": 30,
    "failure_mode": "timeout_504",
    "timeout_ms": 6000,
    "stuck_open": false
  }'
```

## Recommended integration in this project

Set gate barrier as `ip` with:

`http://localhost:8181/open/<gate_id>`

Example:

- Gate 1 -> `http://localhost:8181/open/1`
- Gate 2 -> `http://localhost:8181/open/2`

Then use Gate UI confirm flow to validate session save + barrier trigger + failure handling.
