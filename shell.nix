{ pkgs ? import <nixpkgs> {} }:

# basically only need npm, yarn, and typescript to run
# the build.
pkgs.mkShell {
  buildInputs = [ pkgs.nodejs pkgs.yarn pkgs.typescript ];
}
