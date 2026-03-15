SHELL := /bin/sh

.PHONY: help status tree install typecheck lint format build \
	package vsix-package vsix-install vsix-uninstall \
	test test-unit test-integration test-integration-host \
	check ci clean

help:
	@echo "Available targets:"
	@echo "  make help                 - show this help"
	@echo "  make status               - show git status"
	@echo "  make tree                 - show repository files"
	@echo "  make install              - install development dependencies"
	@echo "  make typecheck - run TypeScript type checking"
	@echo "  make lint                 - run Biome checks"
	@echo "  make format               - run Biome formatter"
	@echo "  make build                - build the extension bundle"
	@echo "  make package              - build and package the extension as a VSIX"
	@echo "  make vsix-package         - package the extension as a VSIX"
	@echo "  make vsix-install         - install the packaged VSIX into VS Code"
	@echo "  make vsix-uninstall       - uninstall the extension from VS Code"
	@echo "  make test                 - run unit tests"
	@echo "  make test-unit            - run unit tests"
	@echo "  make test-integration     - run Docker-backed integration bootstrap"
	@echo "  make test-integration-host - run extension host automation with mock GROWI"
	@echo "  make check                - run typecheck, lint, unit test, and host integration"
	@echo "  make ci                   - alias for make check"
	@echo "  make clean                - remove common local artifacts"

status:
	git status --short --branch

tree:
	find . -maxdepth 2 \
		-not -path './.git*' \
		-not -path './node_modules*' \
		-not -path './dist*' \
		-not -path './out*' \
		| sort

install:
	pnpm install

typecheck:
	pnpm run typecheck

lint:
	pnpm run lint

format:
	pnpm run format

build:
	pnpm run build

package: vsix-package

vsix-package:
	pnpm run package:vsix

vsix-install:
	pnpm run install:vsix

vsix-uninstall:
	pnpm run uninstall:vsix

test: test-unit

test-unit:
	pnpm run test:unit

test-integration:
	pnpm run test:integration

test-integration-host:
	pnpm run test:integration:host

check: typecheck lint test-unit test-integration-host

ci: check

clean:
	rm -rf dist out coverage .cache .nyc_output playwright-report test-results node_modules

-include Makefile.private
