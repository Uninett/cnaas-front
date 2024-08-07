import React from "react";
import FirmwareProgressBar from "./FirmwareProgressBar";
import FirmwareProgressInfo from "./FirmwareProgressInfo";
import getData from "../../utils/getData";
import FirmwareError from "./FirmwareError";
import { Form, Confirm, Select } from "semantic-ui-react";

const API_URL = process.env.API_URL || '';

class FirmwareStep2 extends React.Component {
  state = {
    filename: null,
    firmware_options: [],
    firmware_locked: false,
    firmware_selected: false,
    confirmDiagOpen: false
  };

  openConfirm = () => { this.setState({confirmDiagOpen: true}) };
  closeConfirm = () => { this.setState({confirmDiagOpen: false}) };
  okConfirm = () => {
    this.setState({confirmDiagOpen: false, firmware_locked: true});
    this.props.skipStep2();
  };

  updateFilename(e, option) {
    if (this.state.firmware_locked === false) {
      const val = option.value;
      this.setState({
        filename: val
      });
    }
    this.setState({firmware_selected: true});
  }

  onClickStep2 = (e) => {
    this.setState({firmware_locked: true});
    this.props.firmwareUpgradeStart(2, this.state.filename, null);
    var confirmButtonElem = document.getElementById("step2button");
    confirmButtonElem.disabled = true;
  };

  onClickStep2Abort = (e) => {
    this.props.firmwareUpgradeAbort(2);
    var confirmButtonElem = document.getElementById("step2abortButton");
    confirmButtonElem.disabled = true;
  };

  getFirmwareFiles() {
    const credentials = localStorage.getItem("token");
    let url = API_URL + "/api/v1.0/firmware";
    getData(url, credentials).then(data => {
      console.log("this should be data", data);
      {
        var firmware_options = data.data.files.map((filename, index) => {
          return {'key': index, 'value': filename, 'text': filename};
        })
        this.setState(
          {
            firmware_options: firmware_options
          },
          () => {
            console.log("this is new state", this.state.firmwareInfo);
          }
        );
      }
    });
  }

  componentDidMount() {
    this.getFirmwareFiles();
  }

  render() {
    let jobData = this.props.jobData;
    let jobStatus = this.props.jobStatus;
    let jobId = this.props.jobId;
    let jobFinishedDevices = this.props.jobFinishedDevices;
    let error = "";
    let step2abortDisabled = true;
    let step2disabled = true;

    if (jobStatus === "EXCEPTION") {
      // console.log("jobStatus errored");
      error = [
        <FirmwareError
          devices={this.props.jobResult.devices}
        />
      ];
    } else if (jobStatus === "RUNNING" || jobStatus === "SCHEDULED") {
      step2abortDisabled = false;
    }

    if (this.state.firmware_selected === false) {
      step2disabled = true;
    } else if (this.state.firmware_locked === true) {
      step2disabled = true;
    } else {
      step2disabled = false;
    }

    return (
      <div className="task-container">
        <div className="heading">
          <h2>Activate firmware (2/3)</h2>
          <a href="#">
            <button className="close">Close</button>
          </a>
        </div>
        <div className="task-collapsable">
          <p>
            Step 2 of 3: Download firmware to device and activate it for next reboot
          </p>
          <Form>
            <Select
              placeholder="filename"
              options={this.state.firmware_options}
              onChange={this.updateFilename.bind(this)}
              disabled={this.state.firmware_locked}
            />
            <div className="info">
              <button id="step2button" disabled={step2disabled} onClick={e => this.onClickStep2(e)}>
                Start activate firmware
              </button>
              <button id="step2skipButton" disabled={step2disabled} onClick={e => this.openConfirm(e)}>
                Skip to step 3
              </button>
              <button id="step2abortButton" disabled={step2abortDisabled} onClick={e => this.onClickStep2Abort(e)}>
                Abort!
              </button>
            </div>
          </Form>
          <Confirm
            content="Are you sure all selected devices already have the target firmware downloaded and activated?"
            open={this.state.confirmDiagOpen}
            onCancel={this.closeConfirm}
            onConfirm={this.okConfirm}
          />
          <FirmwareProgressBar
            jobStatus={jobStatus}
            jobFinishedDevices={jobFinishedDevices}
            totalCount={this.props.totalCount}
          />
          <FirmwareProgressInfo
            jobStatus={jobStatus}
            jobId={jobId}
            jobData={jobData}
            logLines={this.props.logLines}
          />
        </div>
        {error}
      </div>
    );
  }
}

export default FirmwareStep2;
