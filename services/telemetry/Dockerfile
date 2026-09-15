FROM golang:1.26.3-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/loom-telemetry .

FROM alpine:3.23
RUN addgroup -S loom && adduser -S -G loom loom
COPY --from=builder /out/loom-telemetry /usr/local/bin/loom-telemetry
USER loom
EXPOSE 9091 9090
ENTRYPOINT ["loom-telemetry"]
