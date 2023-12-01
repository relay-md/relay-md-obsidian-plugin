#!/bin/bash

REQUIRED_OBSIDIAN_VERSION=0.15.0

if [[ -z $1 ]]; then
	echo "Version number as argument required"
	exit 1
fi

TEMPFILE=$(mktemp)
cp versions.json $TEMPFILE
jq '."'$1'" = "'$REQUIRED_OBSIDIAN_VERSION'"' $TEMPFILE >versions.json
