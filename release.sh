#!/bin/bash

REQUIRED_OBSIDIAN_VERSION=0.15.0

if [[ -z $1 ]]; then
	echo "Version number as argument required"
	exit 1
fi

# Store version number in versions.json
TEMPFILE=$(mktemp)
cp versions.json $TEMPFILE
jq '."'$1'" = "'$REQUIRED_OBSIDIAN_VERSION'"' $TEMPFILE >versions.json

# Store version number in manifest.json
TEMPFILE=$(mktemp)
cp manifest.json $TEMPFILE
jq '.version = "'$1'"' $TEMPFILE >manifest.json

# Now lets zip the files
zip dist/release.zip main.js manifest.json styles.css
