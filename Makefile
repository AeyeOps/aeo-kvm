.PHONY: build clean dev install

build:
	./build/setup.sh

install: build
	@echo "[Install] Copying Linux to /opt/aeo-kvm/..."
	@cp dist/linux-arm64/aeo-kvm /opt/aeo-kvm/
	@cp dist/linux-arm64/libhidapi-hidraw.so.0 /opt/aeo-kvm/
	@echo "[Install] Done:"
	@echo "  Linux:   /opt/aeo-kvm/aeo-kvm"
	@echo "  Windows installer: dist/windows-x64/aeo-kvm-installer.exe"

clean:
	rm -rf dist/

dev:
	bun run src/main-ffi.ts $(ARGS)
