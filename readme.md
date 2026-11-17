# MeshCentral-RoutePlus

Port routing plugin for the [MeshCentral2](https://github.com/Ylianst/MeshCentral) Project.

## Installation

 Pre-requisite: First, make sure you have plugins enabled for your MeshCentral installation by adding this to the settings section of your './meshcentral/meshcentral-data/config.json' file:
>     "plugins": {
>          "enabled": true
>     },
Restart your MeshCentral server after making this change.

 To install, simply add the plugin configuration URL when prompted:
 `https://raw.githubusercontent.com/Sokol549/MeshCentral-RoutePlus/master/config.json`

## Features
This plugin allows users to map local ports to remote ports on machines through the MeshCentral server, similar to how MeshCmd with an actions.txt forwards a port. However, instead of having MeshCmd, the user only needs a Mesh Agent installed on each machine.

- Supports multiple ports and endpoints simultaneously
- Settings are saved on the MeshCentral server
- Users can re-map ports and computers on the fly
- Port forwarding is activated upon login to MeshCentral

## Usage Notes
- Active port maps can always be viewed and changed under "My Account" > "Account Actions" > "RoutePlus"
- Tunnels are created in the same way that MeshCmd creates them, and subject to the same authentication.
- Source ports are, by default, randomly generated, however they use a "best efforts" approach to keep the same source port for as long as you have the mapping in place. If the port is found to be in use, it will be re-mapped (and can always be viewed in the settings)
- Source port can now be set to a static port, however if that port is unavailable on the host (e.g. in use) no other port will be assigned.

## Getting Started
1. Open RoutePlus from the left sidebar.
2. Select the source computer, then choose destination computers individually or filter by group and select the visible devices. Both ends need a connected MeshAgent and the user needs remote control permission on both devices.
3. Select a protocol or enter a destination port range. For Dahua SmartPSS, select the Dahua preset (TCP 37777, with optional HTTP 80, HTTPS 443 and RTSP 554). Enter the recorder's network address in the destination IP field if it is reachable through the destination agent. Device ports can differ from these defaults. RoutePlus forwards TCP only, not UDP.
4. Leave the source ports blank for automatic allocation, or enter a range large enough for every selected destination and destination port. For example, a single destination with destination ports 8000–8999 can use the same source range. Existing RoutePlus ports are skipped; ports used by other programs cannot be reserved until the agent tries to listen.
5. Connect to `localhost:<source port>` on the selected source computer. The table shows each mapping's destination and assigned source port. Up to 5000 routes can be requested at once; large ranges create a separate listener and mapping for each port.

To find a potential recorder, select exactly one destination agent and start the network search. The agent probes TCP 37777 by default within up to two of its directly attached private IPv4 /24 networks (narrower interface masks are respected). Select a result to fill the destination IP and Dahua preset. An open port does not identify the device manufacturer; verify the recorder and its configured ports before adding a route. The agent must be online and running the updated plugin core.

Existing mappings without a source continue using the previously selected "My Computer". Source ports are local to their source computer; specify different ports for mappings on the same source.

## Screenshots

![Settings](https://user-images.githubusercontent.com/1929277/71492397-ef6b7a80-2804-11ea-9bf6-695192430aa6.png)

## Unattended operation in this fork

Saved routes are restored when their source agent reconnects, even when the user has no open web session. The server also refreshes the route authorization and retries restoration every minute. The MeshCentral server and both agents must be running and connected; existing application connections can still break during an outage and must reconnect. Use a fixed source port for a stable local address. If that port is occupied the route cannot be used until it is free.

This enables unattended access for every user with saved mappings. RoutePlus uses that user's MeshCentral permissions for each relay connection. Review the server's access policies before enabling the plugin. Check the local listening address and firewall rules for your MeshAgent platform.
