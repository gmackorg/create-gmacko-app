{
  description = "create-gmacko-app template shell for ForgeGraph-style deployments";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              pkgs.pnpm_10
              pkgs.git
            ];

            shellHook = ''
              echo "ForgeGraph-oriented development shell"
              echo "Run: pnpm install"
              echo "Run: pnpm db:migrate:local && pnpm db:seed   # local D1 (apps/web)"
              echo "Run: pnpm dev                                 # emulate + apps/web on https://gmacko.localhost"
            '';
          };
        });
    };
}
