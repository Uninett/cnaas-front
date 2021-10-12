import React from "react";
import { Dropdown, Icon, Pagination, Popup, Button, Select, Checkbox } from "semantic-ui-react";
import DeviceSearchForm from "./DeviceSearchForm";
import checkResponseStatus from "../utils/checkResponseStatus";
import DeviceInitForm from "./DeviceInitForm";
import queryString from 'query-string';
const io = require("socket.io-client");
var socket = null;

const API_URL = process.env.API_URL || '';

class DeviceList extends React.Component {
  state = {
    sortField: "id",
    filterField: null,
    filterValue: null,
    hostname_sort: "",
    device_type_sort: "",
    state_sort: "",
    id_sort: "↓",
    devicesData: [],
    deviceInterfaceData: {},
    activePage: 1,
    totalPages: 1,
    resultsPerPage: 20,
    deviceJobs: {},
    logLines: [],
    queryParamsParsed: false,
    loading: true,
    error: null,
    displayColumns: []
  };

  parseQueryParams(callback) {
    if (this.state.queryParamsParsed === false) {
      this.setState({queryParamsParsed: true});

      let queryParams = queryString.parse(this.props.location.search);
      if (queryParams.filterstring !== undefined) {
        let filterRegex = /filter\[(?<field>\w+)\]=(?<value>\w+)/;
        let match = filterRegex.exec(queryParams.filterstring);
        if (match) {
          this.setState({
            filterField: match.groups.field,
            filterValue: match.groups.value
          }, () => {
            callback();
          });
        }
      } else {
        callback();
      }
    } 
  }

  addDeviceJob = (device_id, job_id) => {
    let deviceJobs = this.state.deviceJobs;
    if (device_id in deviceJobs) {
      deviceJobs[device_id].push(job_id);
    } else {
      deviceJobs[device_id] = [job_id];
    }
    this.setState({deviceJobs: deviceJobs}, () => {
      console.log("device jobs: ", this.state.deviceJobs)
    });
  };

  searchAction = options => {
    this.setState(
      { activePage: 1 },
      () => {
        this.getDevicesData(options);
        window.scrollTo(0, 0);
        // Close all expanded table rows when changing results
        var deviceDetails = document.getElementsByClassName("device_details_row");
        for (var i = 0; i < deviceDetails.length; i++) {
          deviceDetails[i].hidden = true;
        }
      }
    );
  };

  getDevicesData = options => {
    if (options === undefined) options = {};
    let newState = this.state;
    if (options.sortField !== undefined) {
      newState["sortField"] = options.sortField;
    }
    if (
      options.filterField !== undefined &&
      options.filterValue !== undefined
    ) {
      newState["filterField"] = options.filterField;
      newState["filterValue"] = options.filterValue;
    }
    if (options.pageNum !== undefined) {
      newState["activePage"] = options.pageNum;
    }
    this.setState(newState);
    return this.getDevicesAPIData(
      newState["sortField"],
      newState["filterField"],
      newState["filterValue"],
      newState["activePage"]
    );
  };

  /**
   * Handle sorting on different columns when clicking the header fields
   */
  sortHeader = header => {
    let newState = this.state;
    let sortField = "id";
    const oldValue = this.state[header + "_sort"];
    newState["hostname_sort"] = "";
    newState["device_type_sort"] = "";
    newState["state_sort"] = "";
    newState["id_sort"] = "";
    if (oldValue == "" || oldValue == "↑") {
      newState[header + "_sort"] = "↓";
      sortField = header;
    } else if (oldValue == "↓") {
      newState[header + "_sort"] = "↑";
      sortField = "-" + header;
    }
    this.setState(newState);
    this.getDevicesData({ sortField: sortField });
    // Close all expanded table rows when resorting the table
    var deviceDetails = document.getElementsByClassName("device_details_row");
    for (var i = 0; i < deviceDetails.length; i++) {
      deviceDetails[i].hidden = true;
    }
  };

  componentDidMount() {
    const credentials = localStorage.getItem("token");
    if (credentials === null) {
      throw("no API token found");
    }
    if (this.state.queryParamsParsed === false) {
      this.parseQueryParams(this.getDevicesData);
    } else {
      this.getDevicesData();
    }
    socket = io(API_URL, {query: {jwt: credentials}});
    socket.on('connect', function(data) {
      console.log('Websocket connected!');
      var ret = socket.emit('events', {'update': 'device'});
      var ret = socket.emit('events', {'update': 'job'});
      var ret = socket.emit('events', {'loglevel': 'DEBUG'});
    });
    socket.on('events', (data) => {
      // device update event
      if (data.device_id !== undefined && data.action == "UPDATED") {
        let newDevicesData = this.state.devicesData.map((dev) => {
          if (dev.id == data.device_id) {
            return data.object;
          } else {
            return dev;
          }
        });
        this.setState({devicesData: newDevicesData});
      // job update event
      } else if (data.job_id !== undefined) {
        var newLogLines = this.state.logLines;
        if (data.status === "EXCEPTION") {
          newLogLines.push("job #"+data.job_id+" changed status to "+data.status+": "+data.exception+"\n");
        } else {
          newLogLines.push("job #"+data.job_id+" changed status to "+data.status+"\n");
        }
        this.setState({logLines: newLogLines});
        
        // if finished && next_job id, push next_job_id to array
        if (data.next_job_id !== undefined && typeof data.next_job_id === "number") {
          let newDeviceInitJobs = {};
          Object.keys(this.state.deviceJobs).map(device_id => {
            if (this.state.deviceJobs[device_id][0] == data.job_id) {
              newDeviceInitJobs[device_id] = [data.job_id, data.next_job_id];
            } else {
              newDeviceInitJobs[device_id] = this.state.deviceJobs[device_id];
            }
          });
          this.setState({deviceJobs: newDeviceInitJobs}, () => {
            console.log("next_job_updated list: ", this.state.deviceJobs)
          });
        }
      // log events
      } else if (typeof data === 'string' || data instanceof String) {
        var newLogLines = this.state.logLines;
        if (newLogLines.length >= 1000) {
          newLogLines.shift();
        }
        newLogLines.push(data + "\n");
        this.setState({logLines: newLogLines});
      }

    });
  };

  componentWillUnmount() {
    if (socket !== null) {
      socket.off('events');
    }
  }

  readHeaders = response => {
    const totalCountHeader = response.headers.get("X-Total-Count");
    if (totalCountHeader !== null && !isNaN(totalCountHeader)) {
      console.log("total: " + totalCountHeader);
      const totalPages = Math.ceil(totalCountHeader / this.state.resultsPerPage);
      this.setState({ totalPages: totalPages });
    } else {
      console.log("Could not find X-Total-Count header, only showing one page");
    }
    return response;
  };

  getDevicesAPIData = (sortField = "id", filterField, filterValue, pageNum) => {
    this.setState({loading: true, error: null});
    const credentials = localStorage.getItem("token");
    // Build filter part of the URL to only return specific devices from the API
    // TODO: filterValue should probably be urlencoded?
    let filterParams = "";
    let filterFieldOperator = "";
    const stringFields = [
      "hostname",
      "management_ip",
      "serial",
      "ztp_mac",
      "platform",
      "vendor",
      "model",
      "os_version"
    ];
    const false_strings = [
      "false",
      "no",
      "0"
    ]
    if (filterField != null && filterValue != null) {
      if (stringFields.indexOf(filterField) !== -1) {
        filterFieldOperator = "[contains]";
      }
      if (filterField == "synchronized") {
        if (false_strings.indexOf(filterValue) !== -1) {
          filterParams = "&filter[synchronized]=false&filter[state]=MANAGED"
        } else {
          filterParams = "&filter[synchronized]=true&filter[state]=MANAGED"
        }
      } else {
        filterParams =
          "&filter[" +
          filterField +
          "]" +
          filterFieldOperator +
          "=" +
          filterValue;
      }
    }
    fetch(
      API_URL +
      "/api/v1.0/devices?sort=" +
      sortField +
      filterParams +
      "&page=" +
      pageNum +
      "&per_page=" +
      this.state.resultsPerPage
      ,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${credentials}`
        }
      }
    )
    .then(response => checkResponseStatus(response))
    .then(response => this.readHeaders(response))
    .then(response => response.json())
    .then(data => {
      console.log("this should be data", data);
      {
        this.setState(
          {
            devicesData: data.data.devices,
            loading: false
          },
          () => {
            console.log("this is new state", this.state.devicesData);
          }
        );
      }
    })
    .catch((error) => {
      this.setState({
        devicesData: [],
        loading: false,
        error: error
      })
    });
  };

  getInterfacesData(hostname) {
    const credentials = localStorage.getItem("token");
    fetch(
      API_URL + "/api/v1.0/device/" + hostname + "/interfaces",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${credentials}`
        }
      }
    )
    .then(response => checkResponseStatus(response))
    .then(response => response.json())
    .then(data => {
      console.log("this should be interface data", data);
      {
        let newDeviceInterfaceData = this.state.deviceInterfaceData;
        if (Array.isArray(data.data.interfaces) && data.data.interfaces.length)
        {
          newDeviceInterfaceData[hostname] = data.data.interfaces;
          this.setState(
            {
              deviceInterfaceData: newDeviceInterfaceData
            }
          );
        }
      }
    });
  }

  /**
   * Handle expand/collapse of device details when clicking a row in the table
   */
  clickRow(e) {
    const curState = e.target.closest("tr").nextElementSibling.hidden;
    if (curState) {
      e.target.closest("tr").nextElementSibling.hidden = false;
      if (e.target.closest("tr").id in this.state.deviceInterfaceData === false) {
        this.getInterfacesData(e.target.closest("tr").id);
      }
      try {
        e.target.closest("tr").firstElementChild.firstElementChild.className = "angle down icon";
      } catch(error) {
        console.log("Could not change icon for expanded row")
      }
    } else {
      e.target.closest("tr").nextElementSibling.hidden = true;
      try {
        e.target.closest("tr").firstElementChild.firstElementChild.className = "angle right icon";
      } catch(error) {
        console.log("Could not change icon for collapsed row")
      }
    }
  }

  pageChange(e, data) {
    // Update active page and then reload data
    this.setState(
      { activePage: data.activePage },
      () => {
        this.getDevicesData({ numPage: data.activePage } );
        window.scrollTo(0, 0);
        // Close all expanded table rows when changing page
        var deviceDetails = document.getElementsByClassName("device_details_row");
        for (var i = 0; i < deviceDetails.length; i++) {
          deviceDetails[i].hidden = true;
        }
      }
    );
  }

  checkJobId(job_id) {
    return function(logLine) {
      return logLine.toLowerCase().includes("job #"+job_id);
    }
  };

  renderMlagLink(interfaceData) {
    return interfaceData.
      filter(intf => intf.configtype === "MLAG_PEER").
      map(intf => {
      return <a href={"?search_id="+intf.data.neighbor_id} title="Find MLAG peer device">{intf.name}: MLAG peer interface</a>;
    });
  }

  renderUplinkLink(interfaceData) {
    return interfaceData.
      filter(intf => intf.configtype === "ACCESS_UPLINK").
      map(intf => {
        return <a href={"?search_hostname="+intf.data.neighbor} title="Find uplink device">{intf.name}: Uplink to {intf.data.neighbor}</a>;
    });
  }

  renderSortButton(key) {
    if (key === "↑") {
      return <Icon name="sort up" />;
    } else if (key === "↓") {
      return <Icon name="sort down" />;
    } else {
      return <Icon name="sort" />;
    }
  }

  syncDeviceAction(hostname) {
    this.props.history.push("config-change?hostname="+hostname);
  }

  upgradeDeviceAction(hostname) {
    this.props.history.push("firmware-upgrade?hostname="+hostname);
  }

  updateFactsAction(hostname, device_id) {
    console.log("Update facts for hostname: "+hostname);
    const credentials = localStorage.getItem("token");

    let url = API_URL + "/api/v1.0/device_update_facts";
    let job_id = null;
    let dataToSend = {
      hostname: hostname
    };

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials}`
      },
      body: JSON.stringify(dataToSend)
    })
    .then(response => checkResponseStatus(response))
    .then(response => response.json())
    .then(data => {
      if (data.job_id !== undefined && typeof data.job_id === "number") {
        this.addDeviceJob(device_id, data.job_id);
      } else {
        console.log("error when submitting device_update_facts job", data.job_id);
      }
    });
  }

  changeStateAction(device_id, state) {
    console.log("Change state for device_id: "+device_id);
    const credentials = localStorage.getItem("token");

    let url = API_URL + "/api/v1.0/device/" + device_id;
    let dataToSend = {
      state: state,
      synchronized: false
    };

    fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials}`
      },
      body: JSON.stringify(dataToSend)
    })
    .then(response => checkResponseStatus(response))
    .then(response => response.json())
    .then(data => {
      if (data.status !== "success") {
        console.log("error when updating state:", data.error);
      }
    });
  }

  updatePerPageOption(e, option) {
    const val = option.value;
    this.setState({
      resultsPerPage: val
    }, () => this.getDevicesData());
  }

  columnSelectorChange = (e, data) => {
    let newDisplayColumns = this.state.displayColumns;
    if (data.checked === true && newDisplayColumns.indexOf(data.name) === -1) {
      newDisplayColumns.push(data.name);
    } else if (data.checked === false) {
      const index = newDisplayColumns.indexOf(data.name);
      if (index > -1) {
        newDisplayColumns.splice(index, 1);
      }
    }
    this.setState({displayColumns: newDisplayColumns});
  }

  render() {
    const devicesData = this.state.devicesData;
    let deviceInfo = devicesData.map((items, index) => {
      let syncStatus = "";
      if (items.state === "MANAGED") {
        if (items.synchronized === true) {
          syncStatus = (
            <td key="2">
              MANAGED <Icon name="check" color="green" />
            </td>
          );
        } else {
          syncStatus = (
            <td key="2">
              MANAGED <Icon name="delete" color="red" />
            </td>
          );
        }
      } else {
          syncStatus = (
            <td key="2">
              {items.state}
            </td>
          );
      }
      let deviceStateExtra = [];
      let menuActions = [
          <Dropdown.Item text="No actions allowed in this state" disabled={true} />,
      ];
      if (items.state == "DISCOVERED") {
        deviceStateExtra.push(<DeviceInitForm deviceId={items.id} jobIdCallback={this.addDeviceJob.bind(this)} />);
      } else if (items.state == "INIT") {
        if (items.id in this.state.deviceJobs) {
          deviceStateExtra.push(<p>Init jobs: {this.state.deviceJobs[items.id].join(", ")}</p>);
        }
      } else if (items.state == "MANAGED") {
        menuActions = [
          <Dropdown.Item text="Sync device..." onClick={() => this.syncDeviceAction(items.hostname)} />,
          <Dropdown.Item text="Firmware upgrade..." onClick={() => this.upgradeDeviceAction(items.hostname)} />,
          <Dropdown.Item text="Update facts" onClick={() => this.updateFactsAction(items.hostname, items.id) }/>,
          <Dropdown.Item text="Make unmanaged" onClick={() => this.changeStateAction(items.id, "UNMANAGED")} />
        ];
      } else if (items.state == "UNMANAGED") {
        menuActions = [
          <Dropdown.Item text="Update facts" onClick={() => this.updateFactsAction(items.hostname, items.id) }/>,
          <Dropdown.Item text="Make managed" onClick={() => this.changeStateAction(items.id, "MANAGED")} />
        ];
      }
      let deviceInterfaceData = "";
      if (items.hostname in this.state.deviceInterfaceData !== false) {
        let mlagPeerLink = this.renderMlagLink(this.state.deviceInterfaceData[items.hostname]);
        if (mlagPeerLink !== null) {
          deviceStateExtra.push(mlagPeerLink);
        }
        let uplinkLink = this.renderUplinkLink(this.state.deviceInterfaceData[items.hostname]);
        if (uplinkLink !== null) {
          deviceStateExtra.push(uplinkLink);
        }
      }
      let log = {};
      Object.keys(this.state.deviceJobs).map(device_id => {
        log[device_id] = "";
        this.state.deviceJobs[device_id].map(job_id => {
          this.state.logLines.filter(this.checkJobId(job_id)).map(logLine => {
            log[device_id] = log[device_id] + logLine;
            var element = document.getElementById("logoutputdiv_device_id_"+device_id);
            if (element !== null) {
              element.scrollTop = element.scrollHeight;
            }
          });
        });
      });
      let columnData = this.state.displayColumns.map((columnName, colIndex) => {
        return <td key={100 + colIndex}>{items[columnName]}</td>;
      });
      return [
        <tr id={items.hostname} key={index} onClick={this.clickRow.bind(this)}>
          <td key="0">
            <Icon name="angle right" />
            {items.hostname}
          </td>
          <td key="1">{items.device_type}</td>
          {syncStatus}
          {columnData}
          <td key="3">{items.id}</td>
        </tr>,
        <tr
          key={index + "_content"}
          colSpan={4+this.state.displayColumns.length}
          className="device_details_row"
          hidden
        >
          <td>
            <div>
              <Dropdown text="Actions" button={true} >
                <Dropdown.Menu>
                  {menuActions}
                </Dropdown.Menu>
              </Dropdown>
            </div>
            <table className="device_details_table">
              <tbody>
                <tr>
                  <td>Description</td>
                  <td>{items.description}</td>
                </tr>
                <tr>
                  <td>Management IP (DHCP IP)</td>
                  <td>{items.management_ip} ({items.dhcp_ip})</td>
                </tr>
                <tr>
                  <td>Infra IP</td>
                  <td>{items.infra_ip}</td>
                </tr>
                <tr>
                  <td>MAC</td>
                  <td>{items.ztp_mac}</td>
                </tr>
                <tr>
                  <td>Vendor</td>
                  <td>{items.vendor}</td>
                </tr>
                <tr>
                  <td>Model</td>
                  <td>{items.model}</td>
                </tr>
                <tr>
                  <td>OS Version</td>
                  <td>{items.os_version}</td>
                </tr>
                <tr>
                  <td>Serial</td>
                  <td>{items.serial}</td>
                </tr>
                <tr>
                  <td>State</td>
                  <td>{items.state}</td>
                </tr>
              </tbody>
            </table>
            {deviceStateExtra}
            {deviceInterfaceData}
            <div id={"logoutputdiv_device_id_"+items.id} className="logoutput">
              <pre>
                {log[items.id]}
              </pre>
            </div>
          </td>
        </tr>
      ];
    });
    if (this.state.error) {
      deviceInfo = [<tr><td colSpan="5">API error: {this.state.error.message}</td></tr>];
    } else if (!Array.isArray(deviceInfo) || !deviceInfo.length) {
      if (this.state.loading) {
        deviceInfo = [<tr><td colSpan="5"><Icon name="spinner" loading={true} />Loading devices...</td></tr>];
      } else {
        deviceInfo = [<tr><td colSpan="5">Empty result</td></tr>];
      }
    }

    const perPageOptions = [
      { 'key': 20, 'value': 20, 'text': '20' },
      { 'key': 50, 'value': 50, 'text': '50' },
      { 'key': 100, 'value': 100, 'text': '100' },
    ];

    const allowedColumns = {
      "model": "Model",
      "os_version": "OS version",
      "management_ip": "Management IP",
      "dhcp_ip": "DHCP IP",
      "serial": "Serial"
    };

    let columnHeaders = this.state.displayColumns.map(columnName => {
      return <th>{allowedColumns[columnName]}</th>;
    });

    let columnSelectors = Object.keys(allowedColumns).map((columnName, columnIndex) => {
      let checked = false;
      if (this.state.displayColumns.indexOf(columnName) !== -1) {
        checked = true;
      }
      return <li key={columnIndex}><Checkbox defaultChecked={checked} label={allowedColumns[columnName]} name={columnName} onChange={this.columnSelectorChange.bind(this)} /></li>
    })

    return (
      <section>
        <div id="search">
          <DeviceSearchForm location={this.props.location} searchAction={this.searchAction} />
        </div>
        <div id="device_list">
          <h2>Device list</h2>
          <div className="table_options">
            <Popup on='click' pinned position='bottom right' trigger={<Button className="table_options_button"><Icon name="table" /></Button>} >
              <p>Items per page:</p>
              <Select options={perPageOptions} defaultValue={20} onChange={this.updatePerPageOption.bind(this)} />
              <p>Show extra columns:</p>
              <ul>{columnSelectors}</ul>
            </Popup>
          </div>
          <div id="data">
            <table className="device_list">
              <thead>
                <tr>
                  <th onClick={() => this.sortHeader("hostname")}>
                    Hostname
                    <div className="hostname_sort">
                      {this.renderSortButton(this.state.hostname_sort)}
                    </div>
                  </th>
                  <th onClick={() => this.sortHeader("device_type")}>
                    Device type
                    <div className="device_type_sort">
                      {this.renderSortButton(this.state.device_type_sort)}
                    </div>
                  </th>
                  <th onClick={() => this.sortHeader("state")}>
                    State (Sync status)
                    <div className="sync_status_sort">
                      {this.renderSortButton(this.state.state_sort)}
                    </div>
                  </th>
                  {columnHeaders}
                  <th onClick={() => this.sortHeader("id")}>
                    ID
                    <div className="sync_status_sort">
                      {this.renderSortButton(this.state.id_sort)}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>{deviceInfo}</tbody>
            </table>
          </div>
          <div>
            <Pagination
              activePage={this.state.activePage}
              totalPages={this.state.totalPages}
              onPageChange={this.pageChange.bind(this)}
            />
          </div>
        </div>
      </section>
    );
  }
}

export default DeviceList;
