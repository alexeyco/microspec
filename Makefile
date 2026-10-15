.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@printf "@alexeyco/microspec — make targets:\n"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[1m%-6s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: fmt
fmt: node_modules ## Format sources (prettier)
	@node_modules/.bin/prettier --write .

.PHONY: fmt-check
fmt-check: node_modules ## Verify formatting (prettier)
	@node_modules/.bin/prettier --check .

.PHONY: check
check: node_modules fmt-check ## Run repo sanity checks (same as CI)
	@node scripts/check.mjs
	@npm run typecheck --silent
	@npm test --silent

# Existence of node_modules is the only trigger; run `make install` to refresh after manifest changes.
node_modules:
	@npm ci --silent

.PHONY: install
install: ## Reinstall dependencies
	@npm ci --silent
