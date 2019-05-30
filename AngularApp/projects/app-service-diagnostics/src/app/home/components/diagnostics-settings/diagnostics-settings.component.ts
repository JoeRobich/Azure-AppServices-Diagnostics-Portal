import { Component, OnInit, OnDestroy } from '@angular/core';
import { ArmService} from './../../../shared/services/arm.service';
import { AuthService } from '../../../startup/services/auth.service';
import { ActivatedRoute } from '@angular/router';
import { FeatureRegistration, ProviderRegistration} from '../../../shared/models/feature-registration';
import { Subscription, interval } from 'rxjs';
import { ArmResource } from '../../../shared-v2/models/arm';
import { ResourceService } from '../../../shared-v2/services/resource.service';
import { PortalKustoTelemetryService} from '../../../shared/services/portal-kusto-telemetry.service';
import { HttpResponse } from '@angular/common/http';

@Component({
  selector: 'diagnostics-settings',
  templateUrl: './diagnostics-settings.component.html',
  styleUrls: ['./diagnostics-settings.component.scss']
})
export class DiagnosticsSettingsComponent implements OnInit, OnDestroy {
// Resource Properties
  subscriptionId: string;
  currentResource: ArmResource;
  siteConfig: any;
  resourceId: string = '';
// ARM Urls
  featureRegUrl: string = '';
  providerRegUrl: string = '';
// Feature State received from api
  isFeatureRegistered: boolean = false;
// Loading related properties
  updatingProvider: boolean = false;
  updatingTag: boolean = false;
  showInProgress: boolean = false;
  regState: string = '';
  showGeneralError: boolean = false;
  generalErrorMsg: string = '';
  subscription: Subscription;
  EnablementOptions = [{
    option: 'On',
    value: '1',
  }, {
      option: 'Off',
      value: '0'
  }];
  codeScanOption: any = {};
  featureRegOption: any = {};
  alwaysOnOption: any = {};
  retryCount: number = 1;
  showFeatureRegProgress: boolean = false;
  permissionErrorMsg: string = 'You may not have sufficient permissions to perform this operation. Make sure you have required permissions for this subscription and try again.';
  tokenErrorMsg: string = 'Your token may have expired. Please refresh and try again.';
  constructor(private armService: ArmService, private authService: AuthService,
     private activatedRoute: ActivatedRoute, private resourceService: ResourceService,
     private loggingService: PortalKustoTelemetryService) { }

  ngOnInit() {
    this.subscriptionId = this.activatedRoute.snapshot.params['subscriptionid'];
    this.authService.getStartupInfo().subscribe(data => {
        this.resourceId = data.resourceId;
    });
    this.featureRegUrl = `/subscriptions/${this.subscriptionId}/providers/Microsoft.Features/providers/Microsoft.ChangeAnalysis/features/PreviewAccess`;
    this.providerRegUrl = `/subscriptions/${this.subscriptionId}/providers/Microsoft.ChangeAnalysis`;
    this.currentResource = this.resourceService.resource;
    this.checkIfFeatureRegister();
  }

   checkIfFeatureRegister(): void {
    this.clearErrors();
    this.armService.getResourceFullResponse<any>(this.featureRegUrl, true, '2015-12-01').subscribe(response => {
        let featureRegistrationResponse = <FeatureRegistration>response.body;
        let state = featureRegistrationResponse.properties.state;
        if(state.toLowerCase() == 'registered') {
            // Once feature is registered, check if Resource Provider is registered
            this.isFeatureRegistered = true;
            this.checkIfProviderRegistered();
            this.checkIfCodeScanEnabled();
            this.getSiteConfig();
        }
        else {
            // show in progres text and disable enabling
            this.isFeatureRegistered = false;
            this.showFeatureRegProgress = true;
            this.featureRegOption = this.EnablementOptions[1];
            this.alwaysOnOption = this.EnablementOptions[1];
            // start polling until registered
            this.subscription = interval(20000).subscribe(res => {
                this.loggingService.logTrace("Polling for Feature Registration Status");
                this.pollForFeatureRegStatus();
            });
        }
    }, (error: any) => {
        this.logHTTPError(error, 'checkIfFeatureRegister');
        this.showGeneralError = true;
        if(error.status === 403) {
            this.generalErrorMsg = 'Unable to check Change Analysis feature status. ' + this.permissionErrorMsg;
        } else if (error.status === 401) {
            this.generalErrorMsg = 'Unable to check Change Anaylsis feature status. ' + this.tokenErrorMsg;
        } else {
            this.generalErrorMsg = 'Unable to check Change Analysis feature status. Please try again later.';
        }
        this.isFeatureRegistered = false;
        this.showFeatureRegProgress = false;
    });
   }

   checkIfProviderRegistered(): void {
       this.clearErrors();
       this.armService.getResourceFullResponse<any>(this.providerRegUrl, true, '2018-05-01').subscribe(response => {
           let providerRegistrationStateResponse = <ProviderRegistration>response.body;
           let state = providerRegistrationStateResponse.registrationState;
           if (state.toLowerCase() == 'registered') {
               this.featureRegOption = this.EnablementOptions[0];
           } else if (state.toLowerCase() == 'unregistered') {
               this.featureRegOption = this.EnablementOptions[1];
           } // It could be that Resource Provider is 'Registering' or 'Unregistering', show in progress and poll for status.
           else if (state.toLowerCase() == 'registering' || state.toLowerCase() == 'unregistering'){
                this.showInProgress = true;
                this.regState = state;
                this.subscription = interval(30000).subscribe(res => {
                    this.pollResourceProviderReg();
                });
           } else {
                this.featureRegOption = this.EnablementOptions[1];
           }
       }, (error: any) => {
            this.logHTTPError(error, 'checkIfProviderRegistered');
            this.showGeneralError = true;
            if(error.status === 403) {
                this.generalErrorMsg = 'Unable to check Change Analysis Resource Provider status. ' + this.permissionErrorMsg;
            } else if (error.status === 401) {
                this.generalErrorMsg = 'Unable to check Change Anaylsis Resource Provider status. ' + this.tokenErrorMsg;
            } else {
                this.generalErrorMsg = 'Unable to check Change Analysis Resource Provider status. Please try again later.';
            }
            this.featureRegOption = this.EnablementOptions[1];
       })
   }

   checkIfCodeScanEnabled(): void {
       let tags = this.currentResource.tags;
       if(tags && tags['hidden-related:diagnostics/changeAnalysisScanEnabled']) {
           this.codeScanOption = tags['hidden-related:diagnostics/changeAnalysisScanEnabled'] == 'true' ? this.EnablementOptions[0] : this.EnablementOptions[1];
        } else {
           this.codeScanOption = this.EnablementOptions[0];
       }
   }

   getSiteConfig(): void {
       let url = this.resourceId + '/config/web';
       this.armService.getResource(url, '2016-08-01', true).subscribe(data =>{
           this.siteConfig = data;
           if(this.siteConfig.properties['alwaysOn']) {
                this.alwaysOnOption = this.EnablementOptions[0];
           } else {
                this.alwaysOnOption = this.EnablementOptions[1];
           }
       });
   }


   pollForFeatureRegStatus(): void {
    this.armService.getResourceFullResponse<any>(this.featureRegUrl, true, '2015-12-01').subscribe(response => {
        let featureRegistrationStateResponse = <FeatureRegistration>response.body;
        let state = featureRegistrationStateResponse.properties.state;
        // Stop polling once its registered
        if(state.toLowerCase() == 'registered') {
            this.isFeatureRegistered = true;
            this.showFeatureRegProgress = false;
            if(this.subscription) {
                this.subscription.unsubscribe();
            }
        }
    }, (error: any) => {
        this.logHTTPError(error, 'pollForFeatureRegStatus');
        this.isFeatureRegistered = false;
        this.showGeneralError = true;
        this.showFeatureRegProgress = false;
        if(error.status === 403) {
            this.generalErrorMsg = 'Unable to check Change Anaylsis feature status. ' +this.permissionErrorMsg;
        } else if(error.status === 401) {
            this.generalErrorMsg = 'Unable to check Change Anaylsis feature status. ' +this.tokenErrorMsg;
        } else {
            this.generalErrorMsg = 'Unable to check Change Anaylsis feature status. Please try again later.';
        }
        if(this.subscription) {
            this.subscription.unsubscribe();
        }
    });
   }


   setChangeAnalysisEnabled(val: any): void {
       this.featureRegOption = val;
   }


   setCodeScanEnabled(val: any): void {
       this.codeScanOption = val;
   }

   setAlwaysOnEnabled(val: any): void {
       this.alwaysOnOption = val;
   }

   updateScanTag(codeScanOption: any): void {
        this.updatingTag = true;
        let tagValue = codeScanOption.value == '1' ? 'true' : 'false';
        if(this.currentResource.tags) {
            this.currentResource.tags['hidden-related:diagnostics/changeAnalysisScanEnabled'] = tagValue;
        } else {
            this.currentResource.tags = {
                "hidden-related:diagnostics/changeAnalysisScanEnabled": tagValue
            };
        }
        let body = this.currentResource;
        let eventProps = {
            tagName: "hidden-related:diagnostics/changeAnalysisScanEnabled",
            tagValue: tagValue,
            resourceId: this.resourceId
        };
        this.loggingService.logEvent('UpdateScanTag', eventProps);
       this.armService.patchResource(this.currentResource.id, body).subscribe((response:any) => {
        if( response && response.tags ) {
            let tags = response.tags;
            let scanTagName = `hidden-related:diagnostics/changeAnalysisScanEnabled`;
            if(tags[scanTagName] == 'true') {
                this.codeScanOption = this.EnablementOptions[0];
            } else {
                this.codeScanOption = this.EnablementOptions[1];
            }
        } else {
            this.codeScanOption = this.EnablementOptions[1];
        }
        this.updatingTag = false;
    }, (error: any) => {
        this.logHTTPError(error, 'updateScanTag');
        this.updatingTag = false;
        this.codeScanOption = this.EnablementOptions[1];
    });
   }

   updateAlwaysOn(alwaysOnOption: any):void {
       let url = this.resourceId + '/config/web';
       let isEnabled = alwaysOnOption.value == '1' ? true : false;
       this.siteConfig.properties['alwaysOn'] = isEnabled;
       let eventProps = {
           alwaysOnEnabled: isEnabled.toString(),
           resourceId: this.resourceId
       };
       this.loggingService.logEvent("UpdateAlwaysOn", eventProps);
       this.armService.putResource(url, this.siteConfig, '2016-08-01', true).subscribe(data =>{
        this.siteConfig = data;
        if(this.siteConfig.properties['alwaysOn']) {
            this.alwaysOnOption = this.EnablementOptions[0];
        } else {
            this.alwaysOnOption = this.EnablementOptions[1];
        }
        }, (error:any) => {
            this.logHTTPError(error, 'updateAlwaysOn');
            this.alwaysOnOption = this.EnablementOptions[0];
        });
   }

   updateProviderRegister(providerRegOption: any, isRetry: boolean = false): void {
       this.clearErrors();
       if(!isRetry) {
            this.updatingProvider = true;
       }
       let isRegister = providerRegOption.value == '1' ? true : false;
        let url = `/subscriptions/${this.subscriptionId}/providers/Microsoft.ChangeAnalysis/`;
        url += isRegister ? `register` : `unregister`;
        let props = {
            armUrl: url,
            resourceId: this.resourceId
        };
        this.loggingService.logEvent('UpdateChangeAnalysisResourceProvider', props);
        this.armService.postResourceFullResponse(url, {}, true, '2018-05-01').subscribe((response: HttpResponse<{}>) => {
            let providerRegistrationStateResponse = <ProviderRegistration>response.body;
            let state = providerRegistrationStateResponse.registrationState;
            if (state.toLowerCase() == 'registered') {
                this.featureRegOption = this.EnablementOptions[0];
            } else if (state.toLowerCase() == 'unregistered') {
                this.featureRegOption = this.EnablementOptions[1];
            } else {
                this.showInProgress = true;
                this.regState = state;
                this.subscription = interval(30000).subscribe(res => {
                    this.pollResourceProviderReg();
                });
            }
            this.updatingProvider = false;
        }, (error: any) => {
           this.logHTTPError(error, 'updateProviderRegister');
            // When error occurs when updating Resource Provider, retry
            if(this.retryCount <= 3 && isRegister) {
                this.updatingProvider = false;
                this.showInProgress = true;
                this.regState = 'Registering';
                setTimeout( () => {
                    this.loggingService.logTrace('Attempting retry to register resource provider, retry attempt '+this.retryCount);
                    this.updateProviderRegister(this.EnablementOptions[0], true);
                    this.retryCount++;
                }, 30000);
            } else {
                this.showGeneralError = true;
                if(error.status === 403) {
                    this.generalErrorMsg = 'Unable to register/unregister Change Analysis Resource Provider. ' +this.permissionErrorMsg;
                } else if(error.status === 401) {
                    this.generalErrorMsg = 'Unable to register/unregister Change Analysis Resource Provider. '+this.tokenErrorMsg;
                } else {
                    this.generalErrorMsg = 'Unable to register/unregister Change Analysis Resource Provider. Please try again later.';
                }
                this.updatingProvider = false;
                this.showInProgress = false;
                this.featureRegOption = this.EnablementOptions[1];
            }
        });
   }

   pollResourceProviderReg(): void {
    this.armService.getResource<any>(this.providerRegUrl, '2018-05-01', true).subscribe(response => {
        let providerRegistrationStateResponse = <ProviderRegistration>response;
        let state = providerRegistrationStateResponse.registrationState;
        // Final state, stop polling
        if (state.toLowerCase() == 'registered') {
            this.featureRegOption = this.EnablementOptions[0];
            if(this.subscription) {
                this.subscription.unsubscribe();
            }
            this.showInProgress = false;
        }
        if (state.toLowerCase() == 'unregistered') {
            this.featureRegOption = this.EnablementOptions[1];
            if(this.subscription) {
                this.subscription.unsubscribe();
            }
            this.showInProgress = false;
        }
    }, (error: any) => {
        this.logHTTPError(error, 'pollResourceProviderReg');
        this.featureRegOption = this.EnablementOptions[1];
        this.showInProgress = false;
    })
   }

   saveSettings(): void {
       // Register the Resource Provider
       this.updateProviderRegister(this.featureRegOption);
        // Update hidden tag
       this.updateScanTag(this.codeScanOption);
       // Update always on
       this.updateAlwaysOn(this.alwaysOnOption);
   }

   logHTTPError(error: any, methodName: string): void {
        let errorLoggingProps = {
            errorMsg: error.message ? error.message : 'Server Error',
            statusCode: error.status ? error.status : 500
        };
        this.loggingService.logTrace('HTTP error in '+methodName, errorLoggingProps);
   }

   clearErrors(): void {
       this.generalErrorMsg = '';
       this.showGeneralError = false;
   }

   ngOnDestroy(): void {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
    }
}
