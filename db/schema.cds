namespace com.bayer.SXTENDER.ccma;
using { Currency, User, Country, managed, cuid, temporal } from '@sap/cds/common';

@cds.persistence.exists
entity FastConditionContracts: cuid, managed {
  TenderID : String;
  OfferID  : String;
  CountryCode : String;
  InstituteID  : Integer;
  InstituteName: String;
  DistributorID: Integer;
  ContractStartDate: Date;
  ContractEndDate: Date;
  ContractType: String;
  CustomerID: String;
  Division: String;
  Reference: String;
  Status: String;
  Owner: String;
  BrandFilter: String;
  ProductFilter: String;
  Extension: Boolean;
  ExtensionPeriod: String;
  SAPID: String;
  hasNewMaterialNumber: Boolean;
  hasActiveContracts: Boolean;
  hasUpdatedPVL: Boolean;
  hasUpdatedConfidentialPrice: Boolean;
  hasNetPriceAbovePVL: Boolean;
  hasNetPriceBelowFloorPrice: Boolean;
  hasExpiringSoonContracts: Boolean;
  hasExpiredContracts: Boolean;
  hasCancelledContracts: Boolean;
  hasContractsToBeSynchronized: Boolean;
  hasNewContracts: Boolean;
  CCMContract: Composition of many CCMContract on CCMContract.FastConditionContracts = $self;
}

@cds.persistence.exists
entity CCMContract: cuid, managed, temporal{
  ProductCode: String;
  CountryCode : String;
  ProductName: String;
  UoM: String;
  NewMaterialNumber: String;
  BrandID: String;
  BrandName: String;
  OfferPrice: Double;
  hasRappel: String;
  hasFOC: String;
  CCMContractStartDate: Date;
  CCMContractEndDate: Date;
  PreviousContractNumber: String;
  ContractNumber: String;
  Synchronized: Boolean;
  Notified: Boolean;
  Extension: Boolean;
  ExtensionPeriod: String;
  CreationDate: Date;
  CCMCustomer: Composition of CCMCustomer on CCMCustomer.CCMContract = $self;
  CCMMaterial: Composition of many CCMMaterial on CCMMaterial.CCMContract = $self;
  CurrentInvoicePrice: Composition of CurrentInvoicePrice on CurrentInvoicePrice.CCMContract = $self;
  PriceConditionInvoice: Composition of PriceConditionInvoice on PriceConditionInvoice.ProductCode = ProductCode and PriceConditionInvoice.CountryCode = CountryCode;
  PriceConditionRebate:  Composition of PriceConditionRebate on PriceConditionRebate.ProductCode = ProductCode and PriceConditionRebate.CountryCode = CountryCode;
  PriceConditionFOC: Composition of many PriceConditionFOC on PriceConditionFOC.ProductCode = ProductCode and PriceConditionFOC.CountryCode = CountryCode;
  FastConditionContracts: Association to FastConditionContracts
}

@cds.persistence.exists
entity CCMCustomer: cuid, managed, temporal{
  InstituteID: String;
  AssortmentReference: String;
  CustomerID: Integer;
  CountryCode: String;
  InstituteType: String;
  InstituteName: String;
  CCMContract: Association to CCMContract;
}

@cds.persistence.exists
entity CCMMaterial: cuid, managed, temporal{
  CountryCode: String;
  ProductCode: String;
  MaterialNumber: String;
  FOCMaterialNumber: String;
  ActiveRecord: Integer;
  isNewMaterialNumber: Boolean default false;
  CCMContract: Association to CCMContract;
}
@cds.persistence.exists
entity CurrentInvoicePrice: cuid, managed{
  ConditionType: String;
  CountryCode: String;
  SoldToParty: String;
  Material: String;
  YP00: Double;
  YP04: Double;
  YP10: Double;
  YD75: Double;
  YD30: Double;
  YD06: Double;
  YD02: Double;
  SapTax: Double;
  CCMContract: Association to CCMContract;
}

@cds.persistence.exists
entity PriceConditionInvoice: cuid, managed, temporal{
  OfferID                             : String;
  ProductCode                         : Integer;
  ConditionType: String;
  Currency: String;
  Region: String;
  CountryCode: String;
  YP00: Double;
  YP04: Double;
  YP10: Double;
  YD75: Double;
  YD30: Double;
  YD06: Double;
  YD02: Double;
  Tax: Double;
  ConfidentialPrice: Decimal;
  RoyalDecree                         : String;
  RoyalDecreeValue                    : Decimal;
  RoyalDecreeIncl                     : Boolean default false;
  NetPriceWithoutTaxAfterDeductionRD  : Decimal;
  NetPriceWithTaxAfterDeductionRD     : Decimal;
  NetPriceWithoutTax                  : Decimal;
  NetPriceWithTax                     : Decimal;
  MaximumPrice                        : Decimal;
  RequestedVolume                     : Integer;
  RentalPrice                         : Double;
  MonthlyRentPerUnit                  : Double;
  AnnualValue                         : Double;
  CCMContract: Association to CCMContract;
}

@cds.persistence.exists
entity PriceConditionRebate: cuid, managed, temporal{
  OfferID                             : String;
  ProductCode                         : Integer;
  CountryCode                         : String;
  YP00: Double;
  ConfidentialPrice: Decimal;
  SettlementDescription: String;
  Tax: Double;
  RoyalDecree                         : String;
  Liquidation                         : String;
  RefundDate                          : Date;
  PriceConditionCode                  : String;
  CCMContract: Association to CCMContract;
  PriceConditionDiscountCondition: Composition of many PriceConditionDiscountCondition on PriceConditionDiscountCondition.PriceConditionRebate = $self;
}

@cds.persistence.exists
entity PriceConditionDiscountCondition: cuid, managed{
  Volume              : Integer;
  Discount            : Double;
  NetPriceWithoutTax  : Decimal;
  NetPriceWithTax     : Decimal;
  PriceConditionRebate      : Association to PriceConditionRebate;
}

@cds.persistence.exists
entity PriceConditionFOC: cuid, managed, temporal{
  OfferID                             : String;
  CountryCode                         : String;
  ProductCode: Integer;
  FreeGoodsOther: Double;
  FreeGoodsOther_Step: Double;
  FreeGoodsOther_ABS_PCT: String(4);
  VAT: Double; 
  FOCMinAmount                        : Integer;
  FOCBonus                            : String;
  PotentialGeneratedSavings           : Decimal;
  RoyalDecree                         : String;
  ADD_INCLUDE                         : String;
  CCMContract: Association to CCMContract;
}

@cds.persistence.exists
entity APIDefinition: cuid{
    Provider            : String; 
    Host                : String;
    BasePath            : String;
    Resource            : String;
    ResourcePath        : String;
    RequestDelay        : Integer;
    RequestMaxRetry     : Integer;
    AuthType            : String;
    CountryCode         : String;
    Name                : String;     
    OAuth: Association to APIConfigOAuth;
    APIBody: Association to APIBody on APIBody.APIDefinition = $self;
}

@cds.persistence.exists
entity APIConfigOAuth: cuid{
    OAuthProvider : String;
    GrantType     : String;
    ClientID      : String;
    ClientSecret  : String;
    Scope         : String;
}

@cds.persistence.exists
entity APIBody: cuid{
  Source: String;
  Target: String;
  APIDefinition: Association to APIDefinition;
}