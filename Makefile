.PHONY: release
release:
	git diff-index --quiet HEAD || { echo "untracked files! Aborting"; exit 1; }
	git checkout develop
	git checkout -b release/$(shell date +'%Y%m%d')
	git push origin release/$(shell date +'%Y%m%d')
