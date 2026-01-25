.PHONY: build clean dev install

build:
	./build/setup.sh

install: build
	@echo "[Install] Copying Linux to /opt/aeo-kvm/..."
	@cp dist/linux-arm64/aeo-kvm /opt/aeo-kvm/
	@cp dist/linux-arm64/libhidapi-hidraw.so.0 /opt/aeo-kvm/
	@echo "[Install] Copying Windows to /opt/shared/aeo-kvm/..."
	@mkdir -p /opt/shared/aeo-kvm/dist/windows-x64
	@cp dist/windows-x64/aeo-kvm-installer.exe /opt/shared/aeo-kvm/dist/windows-x64/
	@echo "[Install] Done:"
	@echo "  Linux:   /opt/aeo-kvm/aeo-kvm"
	@echo "  Windows: /opt/shared/aeo-kvm/dist/windows-x64/aeo-kvm-installer.exe"

clean:
	rm -rf dist/

dev:
	bun run src/main-ffi.ts $(ARGS)
