import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';
import { ResourceService } from '../../shared-v2/services/resource.service';
import { ArmResource } from '../../shared-v2/models/arm';
import { DetectorControlService } from 'diagnostic-data';

@Injectable()
export class ResourceResolver implements Resolve<Observable<{} | ArmResource>> {
    constructor(private _resourceService: ResourceService, private _detectorControlService: DetectorControlService) { }
    // Live Chat Service is included here so that we ensure an instance is created

    resolve(activatedRouteSnapshot: ActivatedRouteSnapshot): Observable<{} | ArmResource> {
        if (!this._detectorControlService.startTime) {

            this._detectorControlService.setDefault();
        }
        return this._resourceService.registerResource(activatedRouteSnapshot.parent.url.filter(x => x.path !== 'new' && x.path !== 'categories').join('/'));
    }
}
